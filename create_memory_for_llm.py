import os
import time
from langchain_community.document_loaders import PyPDFLoader, DirectoryLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_cohere import CohereEmbeddings
from langchain_community.vectorstores import FAISS

DATA_PATH = 'data/'
DB_FAISS_PATH = 'vectorstore/db_faiss'

def create_vector_db():
    print("Loading PDF documents from data/ directory...")
    loader = DirectoryLoader(DATA_PATH, glob='*.pdf', loader_cls=PyPDFLoader)
    documents = loader.load()
    
    print(f"Splitting {len(documents)} documents into text chunks...")
    text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=100)
    texts = text_splitter.split_documents(documents)
    total_chunks = len(texts)
    print(f"Generated {total_chunks} total text chunks.")

    # Validate that the API key environment variable exists
    if not os.environ.get("COHERE_API_KEY"):
        raise ValueError("COHERE_API_KEY environment variable is missing. Please run: export COHERE_API_KEY='your_key'")

    print("Connecting to Cohere Cloud API for stable embeddings...")
    embeddings = CohereEmbeddings(model="embed-multilingual-v3.0")
    
    print("Generating vectors in rate-limited batches and building FAISS database...")
    
    # Dropped batch size to 50 and added spacing to comfortably stay under 100k tokens/min
    batch_size = 50
    db = None
    
    for i in range(0, total_chunks, batch_size):
        batch_texts = texts[i:i + batch_size]
        current_batch_num = i // batch_size + 1
        total_batches = (total_chunks + batch_size - 1) // batch_size
        
        print(f"Processing chunk batch {current_batch_num}/{total_batches}...", end="", flush=True)
        
        if db is None:
            db = FAISS.from_documents(batch_texts, embeddings)
        else:
            db.add_documents(batch_texts)
            
        print(" Done.")
        
        # Avoid hitting the rate limit on the next loop
        if current_batch_num < total_batches:
            print("Pausing 12 seconds to respect Trial API Rate Limits...")
            time.sleep(12)
    
    print("\nSaving completed FAISS storage to disk...")
    db.save_local(DB_FAISS_PATH)
    print(f"Success! Cloud-computed Vector DB safely saved at {DB_FAISS_PATH}")

if __name__ == "__main__":
    create_vector_db()
