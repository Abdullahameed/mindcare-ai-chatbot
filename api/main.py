import os
from dotenv import load_dotenv

load_dotenv()
import io
import random
import sqlite3
import json
from datetime import datetime
from typing import Optional, List, Dict
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from langchain_groq import ChatGroq
from langchain_community.vectorstores import FAISS
from langchain_cohere import CohereEmbeddings
from langchain_classic.chains import create_retrieval_chain
from langchain_classic.chains.combine_documents import create_stuff_documents_chain
from langchain_core.prompts import ChatPromptTemplate

# Sentiment analysis tool
from textblob import TextBlob

# PDF Generation Engines
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

app = FastAPI(title="MindCare AI API", description="Backend API for MindCare Chatbot")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -------------------------------------------------------
# POSTGRESQL PERSISTENT DATABASE LAYER
# -------------------------------------------------------
import psycopg2
import psycopg2.extras

DATABASE_URL = os.environ.get("DATABASE_URL")

class DBConnectionWrapper:
    def __init__(self, conn):
        self.conn = conn

    def execute(self, query, params=None):
        cur = self.conn.cursor()
        cur.execute(query, params)
        return cur

    def commit(self):
        self.conn.commit()

    def close(self):
        self.conn.close()

def get_db():
    if not DATABASE_URL:
        raise ValueError("DATABASE_URL environment variable is missing")
    conn = psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.DictCursor)
    return DBConnectionWrapper(conn)

def init_db():
    if not DATABASE_URL:
        print("DATABASE_URL not set, skipping database initialization")
        return
    conn = get_db()

    conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            user_id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    conn.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            session_id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            title TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(user_id)
        )
    """)

    conn.execute("""
        CREATE TABLE IF NOT EXISTS messages (
            id SERIAL PRIMARY KEY,
            session_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            role TEXT NOT NULL,
            message TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            FOREIGN KEY (session_id) REFERENCES sessions(session_id)
        )
    """)

    conn.execute("""
        CREATE TABLE IF NOT EXISTS mood_tracker (
            user_id TEXT PRIMARY KEY,
            happy INTEGER DEFAULT 0,
            neutral INTEGER DEFAULT 0,
            sad INTEGER DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES users(user_id)
        )
    """)

    conn.commit()
    conn.close()
    print("PostgreSQL database initialized successfully.")

# -------------------------------------------------------
# DATABASE HELPER FUNCTIONS
# -------------------------------------------------------

def db_get_user_by_username(username: str):
    conn = get_db()
    user = conn.execute("SELECT * FROM users WHERE username = %s", (username,)).fetchone()
    conn.close()
    return dict(user) if user else None

def db_get_user_by_id(user_id: str):
    conn = get_db()
    user = conn.execute("SELECT * FROM users WHERE user_id = %s", (user_id,)).fetchone()
    conn.close()
    return dict(user) if user else None

def db_create_user(user_id: str, username: str, password: str):
    conn = get_db()
    conn.execute(
        "INSERT INTO users (user_id, username, password) VALUES (%s, %s, %s)",
        (user_id, username, password)
    )
    conn.execute(
        "INSERT INTO mood_tracker (user_id, happy, neutral, sad) VALUES (%s, 0, 0, 0)",
        (user_id,)
    )
    conn.commit()
    conn.close()

def db_get_mood(user_id: str):
    conn = get_db()
    row = conn.execute("SELECT * FROM mood_tracker WHERE user_id = %s", (user_id,)).fetchone()
    conn.close()
    if row:
        return {"Happy": row["happy"], "Neutral": row["neutral"], "Sad": row["sad"]}
    return {"Happy": 0, "Neutral": 0, "Sad": 0}

def db_update_mood(user_id: str, mood_key: str):
    conn = get_db()
    conn.execute(
        "INSERT INTO mood_tracker (user_id, happy, neutral, sad) VALUES (%s, 0, 0, 0) ON CONFLICT (user_id) DO NOTHING",
        (user_id,)
    )
    conn.execute(
        f"UPDATE mood_tracker SET {mood_key} = {mood_key} + 1 WHERE user_id = %s",
        (user_id,)
    )
    conn.commit()
    conn.close()

def db_get_session_titles(user_id: str):
    conn = get_db()
    rows = conn.execute(
        "SELECT session_id, title FROM sessions WHERE user_id = %s ORDER BY created_at DESC",
        (user_id,)
    ).fetchall()
    conn.close()
    return [{"session_id": row["session_id"], "title": row["title"]} for row in rows]

def db_create_session(session_id: str, user_id: str, title: str):
    conn = get_db()
    conn.execute(
        "INSERT INTO sessions (session_id, user_id, title) VALUES (%s, %s, %s) ON CONFLICT (session_id) DO NOTHING",
        (session_id, user_id, title)
    )
    conn.commit()
    conn.close()

def db_session_exists(session_id: str) -> bool:
    conn = get_db()
    row = conn.execute("SELECT 1 FROM sessions WHERE session_id = %s", (session_id,)).fetchone()
    conn.close()
    return row is not None

def db_add_message(session_id: str, user_id: str, role: str, message: str):
    conn = get_db()
    timestamp = datetime.now().isoformat()
    conn.execute(
        "INSERT INTO messages (session_id, user_id, role, message, timestamp) VALUES (%s, %s, %s, %s, %s)",
        (session_id, user_id, role, message, timestamp)
    )
    conn.commit()
    conn.close()

def db_get_messages(session_id: str):
    conn = get_db()
    rows = conn.execute(
        "SELECT role, message, timestamp FROM messages WHERE session_id = %s ORDER BY id ASC",
        (session_id,)
    ).fetchall()
    conn.close()
    return [{"role": row["role"], "message": row["message"], "timestamp": row["timestamp"]} for row in rows]

def db_get_all_user_sessions(user_id: str):
    conn = get_db()
    sessions = conn.execute(
        "SELECT session_id, title FROM sessions WHERE user_id = %s ORDER BY created_at ASC",
        (user_id,)
    ).fetchall()
    conn.close()

    result = {}
    for session in sessions:
        sid = session["session_id"]
        result[sid] = {
            "title": session["title"],
            "messages": db_get_messages(sid)
        }
    return result

# -------------------------------------------------------
# NEW: Build conversation history string from last N messages
# -------------------------------------------------------
def build_conversation_history(session_id: str, max_messages: int = 8) -> str:
    """
    Fetches the last `max_messages` messages from the session
    and formats them as a readable conversation history string.
    This is injected into the LLM prompt so the AI remembers
    what was said earlier in the same session.
    """
    messages = db_get_messages(session_id)

    # Take only the last max_messages to avoid token overflow
    recent = messages[-max_messages:] if len(messages) > max_messages else messages

    if not recent:
        return ""

    history_lines = []
    for msg in recent:
        speaker = "Patient" if msg["role"] == "user" else "MindCare AI"
        history_lines.append(f"{speaker}: {msg['message']}")

    return "\n".join(history_lines)


# -------------------------------------------------------
# SCHEMAS
# -------------------------------------------------------
class ChatRequest(BaseModel):
    user_id: str
    session_id: Optional[str] = "default_session"
    message: str

class AuthRequest(BaseModel):
    username: str
    password: str


# Paths and Environment variables
DB_FAISS_PATH = os.path.join(os.path.dirname(__file__), "..", "vectorstore", "db_faiss")
GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
COHERE_API_KEY = os.environ.get("COHERE_API_KEY")

retrieval_chain = None

@app.on_event("startup")
async def startup_event():
    global retrieval_chain

    init_db()

    try:
        embeddings = CohereEmbeddings(model="embed-english-v3.0", cohere_api_key=COHERE_API_KEY)
        vectorstore = FAISS.load_local(DB_FAISS_PATH, embeddings, allow_dangerous_deserialization=True)
        retriever = vectorstore.as_retriever(search_kwargs={"k": 3})

        llm = ChatGroq(model="llama-3.3-70b-versatile", groq_api_key=GROQ_API_KEY, temperature=0.4)

 
        #  SYSTEM PROMPT includes {history} placeholder
        # so the LLM receives the conversation history on every call
    
        system_prompt = (
            "You are MindCare AI, a strictly scoped clinical mental health companion. "
            "Your ONLY function is to assist with mental health, psychology, emotional wellbeing, "
            "therapy, and related clinical topics. "
            "You MUST use the provided clinical context below to ground your responses. "
            "STRICT RULES:\n"
            "1. If the user's question is NOT related to mental health, psychology, or emotional wellbeing, "
            "you MUST respond ONLY with: 'I am designed exclusively for mental health support. "
            "I cannot assist with unrelated topics. Please ask me about your mental wellbeing.'\n"
            "2. NEVER answer general knowledge, history, science, geography, or any off-topic questions.\n"
            "3. NEVER fabricate clinical information. If unsure, say so.\n"
            "4. Always be compassionate and supportive in tone.\n"
            "5. Use the conversation history below to maintain context and remember what the patient "
            "has already shared. If the patient mentions their name, feelings, or personal details "
            "earlier in the conversation, refer to them naturally in your responses.\n\n"
            "--- CONVERSATION HISTORY (last 8 messages) ---\n"
            "{history}\n"
            "--- END OF HISTORY ---\n\n"
            "Clinical Context:\n{context}"
        )

        prompt = ChatPromptTemplate.from_messages([
            ("system", system_prompt),
            ("human", "{input}"),
        ])

        question_answer_chain = create_stuff_documents_chain(llm, prompt)
        retrieval_chain = create_retrieval_chain(retriever, question_answer_chain)
        print("RAG execution engine with conversation memory configured successfully.")
    except Exception as e:
        print(f"Startup execution error during RAG initialization: {str(e)}")


# -------------------------------------------------------
# CORE ROUTES
# -------------------------------------------------------

@app.get("/")
async def root():
    return {"status": "active", "service": "MindCare Core Application Layer"}

@app.get("/api/admin/users")
async def admin_get_users(secret: str = None):
    if secret != "admin123":
        raise HTTPException(status_code=401, detail="Unauthorized Admin Access")
    conn = get_db()
    users = conn.execute("SELECT user_id, username, created_at FROM users").fetchall()
    conn.close()
    return {"users": [dict(u) for u in users]}


# -------------------------------------------------------
# AUTHENTICATION
# -------------------------------------------------------

@app.post("/api/auth/signup")
async def signup(payload: AuthRequest):
    username_clean = payload.username.strip()

    if db_get_user_by_username(username_clean):
        raise HTTPException(status_code=400, detail="Account username already allocated.")

    new_uid = str(random.randint(1000, 9999))
    while db_get_user_by_id(new_uid):
        new_uid = str(random.randint(1000, 9999))

    db_create_user(new_uid, username_clean, payload.password)

    return {"user_id": new_uid, "username": username_clean, "detail": "User registration successfully executed."}


@app.post("/api/auth/login")
async def login(payload: AuthRequest):
    username_clean = payload.username.strip()
    user_record = db_get_user_by_username(username_clean)

    if not user_record or user_record["password"] != payload.password:
        raise HTTPException(status_code=401, detail="Invalid credential combination provided.")

    return {"user_id": user_record["user_id"], "username": user_record["username"], "detail": "Authentication valid."}
class ResetPasswordRequest(BaseModel):
    username: str
    new_password: str


@app.post("/api/auth/reset-password")
async def reset_password(payload: ResetPasswordRequest):

    conn = get_db()

    user = conn.execute(
        "SELECT * FROM users WHERE username = %s",
        (payload.username,)
    ).fetchone()

    if not user:
        conn.close()
        raise HTTPException(status_code=404, detail="Username not found.")

    conn.execute(
        "UPDATE users SET password = %s WHERE username = %s",
        (payload.new_password, payload.username)
    )

    conn.commit()
    conn.close()

    return {"detail": "Password reset successful."}

# -------------------------------------------------------
# DYNAMIC CHAT PIPELINE — WITH CONVERSATION MEMORY
# -------------------------------------------------------

@app.post("/api/chat")
async def chat_endpoint(payload: ChatRequest):
    global retrieval_chain
    if not retrieval_chain:
        raise HTTPException(status_code=503, detail="RAG framework failed initialization routines.")

    uid = payload.user_id
    sid = payload.session_id
    user_msg = payload.message

    # Create session if it doesn't exist
    if not db_session_exists(sid):
        generated_title = user_msg[:22] + "..." if len(user_msg) > 22 else user_msg
        db_create_session(sid, uid, generated_title)

    # Sentiment analysis
    analysis = TextBlob(user_msg)
    polarity = analysis.sentiment.polarity
    if polarity > 0.15:
        db_update_mood(uid, "happy")
    elif polarity < -0.15:
        db_update_mood(uid, "sad")
    else:
        db_update_mood(uid, "neutral")

    # Save user message BEFORE building history
    # (so this message is NOT included in the history we pass —
    #  it will be passed as the {input} instead, avoiding duplication)
    db_add_message(sid, uid, "user", user_msg)

    # -------------------------------------------------------
    # NEW: Build conversation history from previous messages
    # We fetch BEFORE the current message was added by slicing [-9:-1]
    # to get the 8 messages before the one just saved
    # -------------------------------------------------------
    all_msgs = db_get_messages(sid)

    # Exclude the message we just saved (last one) — it's the {input}
    # Take up to 8 previous messages as history
    previous_msgs = all_msgs[:-1]  # everything except the current message
    recent_history = previous_msgs[-8:] if len(previous_msgs) > 8 else previous_msgs

    if recent_history:
        history_lines = []
        for msg in recent_history:
            speaker = "Patient" if msg["role"] == "user" else "MindCare AI"
            history_lines.append(f"{speaker}: {msg['message']}")
        history_text = "\n".join(history_lines)
    else:
        history_text = "No previous conversation in this session."

    try:
        # -------------------------------------------------------
        # Pass both the current message AND conversation history
        # -------------------------------------------------------
        response = retrieval_chain.invoke({
            "input": user_msg,
            "history": history_text
        })
        ai_answer = response.get("answer", "Processing error encountered.")

        # Save AI response
        db_add_message(sid, uid, "ai", ai_answer)

        return {"response": ai_answer}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Inference processing failure: {str(e)}")


# -------------------------------------------------------
# HISTORICAL SIDEBAR FETCH
# -------------------------------------------------------

@app.get("/api/chat/history/{user_id}")
async def get_chat_history_sidebar(user_id: str):
    return {"history": db_get_session_titles(user_id)}


# -------------------------------------------------------
# MOOD ANALYTICS
# -------------------------------------------------------

@app.get("/api/mood-analytics/{user_id}")
async def get_mood_analytics(user_id: str):
    mood = db_get_mood(user_id)
    return {
        "user_id": user_id,
        "metrics": [
            {"category": "Happy", "count": mood["Happy"]},
            {"category": "Neutral", "count": mood["Neutral"]},
            {"category": "Sad", "count": mood["Sad"]}
        ]
    }


# -------------------------------------------------------
# PDF EXPORT
# -------------------------------------------------------

@app.get("/api/export-report/{user_id}")
async def export_report(user_id: str):
    user_sessions = db_get_all_user_sessions(user_id)

    if not user_sessions or all(len(s["messages"]) == 0 for s in user_sessions.values()):
        raise HTTPException(status_code=400, detail="No clinical logs captured to construct report summaries.")

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=40, leftMargin=40, topMargin=40, bottomMargin=40
    )

    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        'DocTitle', parent=styles['Heading1'], fontName='Helvetica-Bold', fontSize=24,
        textColor=colors.HexColor('#1A365D'), spaceAfter=12
    )
    section_style = ParagraphStyle(
        'SecTitle', parent=styles['Heading2'], fontName='Helvetica-Bold', fontSize=14,
        textColor=colors.HexColor('#2C5282'), spaceBefore=15, spaceAfter=8
    )
    body_style = ParagraphStyle(
        'DocBody', parent=styles['Normal'], fontName='Helvetica', fontSize=10.5,
        textColor=colors.HexColor('#2D3748'), leading=14
    )

    story = []

    story.append(Paragraph("MindCare AI - Clinical Consultation Report", title_style))
    story.append(Paragraph(f"<b>Generated On:</b> {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}", body_style))
    story.append(Paragraph(f"<b>Patient Reference Identifier:</b> MC-{user_id}", body_style))
    story.append(Spacer(1, 15))

    story.append(Paragraph("1. Sentiment Polarity Breakdown", section_style))
    mood_metrics = db_get_mood(user_id)

    data_table = [
        [Paragraph('<b>Mental Framework Condition</b>', body_style), Paragraph('<b>Captured Event Frequency</b>', body_style)],
        [Paragraph('Happy / Positive Alignment', body_style), str(mood_metrics["Happy"])],
        [Paragraph('Neutral / Grounded Monitoring', body_style), str(mood_metrics["Neutral"])],
        [Paragraph('Sad / Distressed Indication', body_style), str(mood_metrics["Sad"])]
    ]

    t = Table(data_table, colWidths=[250, 150])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (1, 0), colors.HexColor('#E2E8F0')),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#CBD5E0')),
        ('PADDING', (0, 0), (-1, -1), 8),
    ]))
    story.append(t)
    story.append(Spacer(1, 15))

    story.append(Paragraph("2. Verified Transcript Logs", section_style))

    for session_id, session_data in user_sessions.items():
        if not session_data["messages"]:
            continue
        story.append(Paragraph(f"<b>Session Fragment: {session_data['title']}</b>", body_style))
        story.append(Spacer(1, 4))

        for msg in session_data["messages"]:
            speaker = "Patient" if msg["role"] == "user" else "MindCare Assistant"
            prefix = f"<b>[{speaker}]:</b> "
            story.append(Paragraph(prefix + msg["message"], body_style))
            story.append(Spacer(1, 4))
        story.append(Spacer(1, 10))

    doc.build(story)
    buffer.seek(0)

    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=MindCare_Clinical_Report_{user_id}.pdf"}
    )
