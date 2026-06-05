"use client";
import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Send, Smile, Meh, Frown, FileText, Sparkles, PlusCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

export default function MindCareApp() {
  const [view, setView] = useState("landing"); // Flow: landing -> auth -> dashboard
  const [authMode, setAuthMode] = useState("signup"); // signup or signin or forgot

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [userSession, setUserSession] = useState(null);
  const [currentSessionId, setCurrentSessionId] = useState("session_" + Date.now());
  const [authError, setAuthError] = useState("");
  const [resetUsername, setResetUsername] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [speechSupported, setSpeechSupported] = useState(true);

  const [messages, setMessages] = useState([
    { text: "Hello, this platform is designed to provide mental well-being support with personalized features.", isBot: true }
  ]);
  const [inputMessage, setInputMessage] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState([]);

  // Fixed 3 Column Layout for real sentiment distribution tracking
  const [moodTrends, setMoodTrends] = useState([
    { category: "Happy", count: 0, color: "from-emerald-400 to-teal-400" },
    { category: "Neutral", count: 0, color: "from-amber-400 to-orange-400" },
    { category: "Sad", count: 0, color: "from-rose-400 to-pink-400" }
  ]);

  const recognitionRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Auto-scroll chat to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 1. Fetch Real-Time Sentiment Metric Summary
  const fetchAnalytics = async (id) => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000'}/api/mood-analytics/${id}`);
      const data = await res.json();
      if (data.metrics) {
        const mapped = moodTrends.map(trend => {
          const match = data.metrics.find(m => m.category === trend.category);
          return {
            ...trend,
            count: match ? match.count : 0
          };
        });
        setMoodTrends(mapped);
      }
    } catch (err) {
      console.log("Analytics aggregation sync fallback processed.");
    }
  };

  // 2. Fetch Real-Time Chat History Sidebar Content
  const fetchHistory = async (id) => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000'}/api/chat/history/${id}`);
      const data = await res.json();
      if (data.history) {
        setChatHistory(data.history);
      }
    } catch (err) {
      console.log("History sidebar sync execution error.");
    }
  };

  // 3. Clear Chat to trigger a brand-new real-time title workflow
  const handleNewChat = () => {
    // Stop any ongoing speech when starting new session
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
    setCurrentSessionId("session_" + Date.now());
    setMessages([
      { text: "New session active. How can I assist your wellness progression today?", isBot: true }
    ]);
  };

  // 4. Text-to-Speech — reads bot response aloud
  const speak = (text) => {
    // Cancel any ongoing speech before starting new one
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 0.95;
    utterance.pitch = 1;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
  };

  // 5. Stop speech manually
  const stopSpeaking = () => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  };

  // Initialize SpeechRecognition on mount
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition && window.isSecureContext !== false) {
      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = 'en-US';
      rec.onresult = (e) => {
        setInputMessage(e.results[0][0].transcript);
        setIsListening(false);
      };
      rec.onerror = (e) => {
        console.log("Speech recognition error:", e.error);
        setIsListening(false);
      };
      rec.onend = () => setIsListening(false);
      recognitionRef.current = rec;
    } else {
      setSpeechSupported(false);
    }
  }, []);

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError("");
    if (!username.trim() || !password.trim()) {
      setAuthError("Please enter both username and password.");
      return;
    }

    const endpoint = authMode === "signup" ? "signup" : "login";

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000'}/api/auth/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password: password.trim() })
      });

      const data = await res.json();

      if (res.ok) {
        const userId = data.user_id;
        const finalUsername = data.username || username;

        if (userId) {
          setUserSession({ user_id: userId, username: finalUsername });
          fetchAnalytics(userId);
          fetchHistory(userId);
          setView("dashboard");
        } else {
          setAuthError("Authentication succeeded but session configuration was invalid.");
        }
      } else {
        setAuthError(data.detail || `Server returned error code: ${res.status}`);
      }
    } catch (err) {
      setAuthError("Backend service refused connection. Please try again.");
    }
  };

  const handleResetSubmit = async (e) => {
    e.preventDefault();
    setAuthError("");
    if (!resetUsername.trim() || !resetPassword.trim()) {
      setAuthError("Please enter both username and new password.");
      return;
    }
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000'}/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: resetUsername.trim(), new_password: resetPassword.trim() })
      });
      const data = await res.json();
      if (res.ok) {
        setAuthMode("signin");
        setAuthError("Password successfully updated. Please sign in.");
      } else {
        setAuthError(data.detail || "Failed to reset password.");
      }
    } catch (err) {
      setAuthError("Backend service refused connection.");
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputMessage.trim() || isLoading) return;

    const userText = inputMessage;
    setMessages(prev => [...prev, { text: userText, isBot: false }]);
    setInputMessage("");
    setIsLoading(true);

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000'}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userSession.user_id,
          session_id: currentSessionId,
          message: userText
        })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Server error");
      }

      // Add bot response to chat
      setMessages(prev => [...prev, { text: data.response, isBot: true }]);
      setIsLoading(false);

      // TEXT-TO-SPEECH: Read the bot response aloud automatically
      speak(data.response);

      // Instantly trigger re-renders for live state variables
      fetchAnalytics(userSession.user_id);
      fetchHistory(userSession.user_id);
    } catch (error) {
      setIsLoading(false);
      setMessages(prev => [...prev, { text: "Error maintaining connection pipeline with RAG instance server.", isBot: true }]);
    }
  };

  // Voice input toggle
  const toggleVoice = () => {
    if (!speechSupported || !recognitionRef.current) return;

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (err) {
        console.log("Speech recognition start error:", err);
        setIsListening(false);
        setSpeechSupported(false); // Graceful fallback if it fails dynamically
      }
    }
  };

  const handleDownloadPDF = () => {
    if (!userSession) return;
    window.location.href = `${process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000'}/api/export-report/${userSession.user_id}`;
  };

  const getMaxMetricCount = () => {
    const max = Math.max(...moodTrends.map(m => m.count), 0);
    return max === 0 ? 1 : max;
  };

  // --- VIEW 1: LANDING INTERFACE ---
  if (view === "landing") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#EBF5FB] via-[#D5E6F7] to-[#BACDDF] flex flex-col items-center p-8 justify-between text-slate-700">
        <div className="w-full max-w-6xl flex justify-between items-center">
          <div className="flex items-center gap-2 text-sky-600 font-medium">
            <Sparkles className="w-5 h-5 text-sky-400" />
            <span className="font-bold tracking-wide text-slate-800 text-lg">MindCare AI</span>
          </div>
          <div className="flex items-center gap-4 text-sm font-semibold">
            <button onClick={() => { setAuthMode("signin"); setView("auth"); }} className="text-slate-600 hover:text-slate-900">Log in</button>
            <button onClick={() => { setAuthMode("signup"); setView("auth"); }} className="bg-[#A4D4F4] text-slate-800 px-5 py-2.5 rounded-xl border border-sky-300 shadow-sm">Start Chatting</button>
          </div>
        </div>

        <div className="text-center max-w-2xl my-auto flex flex-col items-center">
          <h1 className="text-6xl font-extrabold tracking-tight text-slate-950 mb-4">Your Mind Matters.</h1>
          <p className="text-slate-500 text-base mb-8 max-w-md mx-auto leading-relaxed font-medium">
            A private, AI-powered companion to combine with therapy, tracking mental health and wellness.
          </p>
          <div className="flex justify-center gap-4 text-sm font-bold mb-12">
            <button onClick={() => { setAuthMode("signup"); setView("auth"); }} className="bg-sky-500 text-white px-8 py-3.5 rounded-xl shadow-md hover:bg-sky-600 transition-all">Get Started</button>
            <button onClick={() => { setAuthMode("signin"); setView("auth"); }} className="bg-white text-slate-700 px-8 py-3.5 rounded-xl border border-slate-200 shadow-sm hover:bg-slate-50 transition-all">Welcome Back</button>
          </div>
          <div className="flex justify-center w-full max-w-xl bg-white/40 p-4 rounded-3xl border border-white/60 shadow-inner overflow-hidden">
            <img src="/illustration.png" alt="Therapy Illustration" className="h-64 object-contain" onError={(e) => { e.target.src = "https://illustrations.popsy.co/sky/group-therapy.svg" }} />
          </div>
        </div>

        <div className="w-full max-w-5xl mt-8">
          <h2 className="text-center font-bold text-slate-800 text-xl mb-6 tracking-wide">System Architecture Core Features</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-[#4FA3F7] text-white p-6 rounded-[24px] shadow-md">
              <span className="text-3xl font-black block mb-2 opacity-80">01</span>
              <h4 className="font-bold text-base mb-2">Empathetic AI</h4>
              <p className="text-xs text-sky-50 leading-relaxed">Empathetic AI is integrated with live context stores to provide structural documentation.</p>
            </div>
            <div className="bg-[#D4EBF7] p-6 rounded-[24px] border border-[#BCE2F7] shadow-sm">
              <span className="text-3xl font-black block text-sky-600 mb-2">02</span>
              <h4 className="font-bold text-slate-800 text-base mb-2">Real Mood Distribution</h4>
              <p className="text-xs text-slate-600 leading-relaxed">Tracks processing polarity logs dynamically to populate exact emotion bar charts.</p>
            </div>
            <div className="bg-white p-6 rounded-[24px] border border-slate-100 shadow-md">
              <span className="text-3xl font-black block text-slate-300 mb-2">03</span>
              <h4 className="font-bold text-slate-800 text-base mb-2">Clinical Verification</h4>
              <p className="text-xs text-slate-500 leading-relaxed">Export valid system transcripts structured instantly into automated medical PDFs.</p>
            </div>
          </div>
        </div>

        <footer className="w-full mt-12 pt-6 border-t border-white/40 text-center">
          <p className="text-slate-500 font-medium text-sm">Developed by Abdullah</p>
        </footer>
      </div>
    );
  }

  // --- VIEW 2: AUTHENTICATION INTERFACE ---
  if (view === "auth") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#EBF5FB] via-[#D5E6F7] to-[#BACDDF] flex items-center justify-center p-6">
        <div className="backdrop-blur-md bg-white/40 w-full max-w-md rounded-[32px] p-8 border border-white/60 shadow-2xl">
          <div className="flex bg-white/40 rounded-2xl p-1.5 mb-8 shadow-inner border border-white/40">
            <button type="button" onClick={() => { setAuthMode("signup"); setAuthError(""); }} className={`flex-1 text-center py-2.5 text-xs font-bold rounded-xl transition-all ${authMode === "signup" ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>Sign up</button>
            <button type="button" onClick={() => { setAuthMode("signin"); setAuthError(""); }} className={`flex-1 text-center py-2.5 text-xs font-bold rounded-xl transition-all ${(authMode === "signin" || authMode === "forgot") ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>Sign In</button>
          </div>

          <h2 className="text-center font-extrabold text-slate-800 text-2xl mb-6">
            {authMode === "signup" ? "Join MindCare" : authMode === "forgot" ? "Reset Password" : "Welcome Back"}
          </h2>

          {authError && (
            <div className="bg-rose-100 text-rose-600 text-xs font-bold p-3 rounded-xl mb-4 text-center shadow-sm">
              {authError}
            </div>
          )}

          {authMode !== "forgot" ? (
            <form onSubmit={handleAuthSubmit} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase ml-1 mb-1 tracking-wider">Username</label>
                <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="Username" className="w-full bg-[#EDF3FA] border border-slate-200 rounded-xl px-4 py-3.5 text-xs font-medium focus:outline-none focus:border-sky-400 text-slate-800 shadow-inner" />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase ml-1 mb-1 tracking-wider">Password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" className="w-full bg-[#EDF3FA] border border-slate-200 rounded-xl px-4 py-3.5 text-xs font-medium focus:outline-none focus:border-sky-400 text-slate-800 shadow-inner" />
              </div>
              <button type="submit" className="w-full bg-[#6484AC] hover:bg-[#537299] text-white font-bold text-xs py-4 rounded-xl transition-colors shadow-md mt-4 uppercase tracking-wider">
                {authMode === "signup" ? "Sign Up" : "Sign In"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleResetSubmit} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase ml-1 mb-1 tracking-wider">Username</label>
                <input type="text" value={resetUsername} onChange={e => setResetUsername(e.target.value)} placeholder="Enter your username" className="w-full bg-[#EDF3FA] border border-slate-200 rounded-xl px-4 py-3.5 text-xs font-medium focus:outline-none focus:border-sky-400 text-slate-800 shadow-inner" />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase ml-1 mb-1 tracking-wider">New Password</label>
                <input type="password" value={resetPassword} onChange={e => setResetPassword(e.target.value)} placeholder="Enter new password" className="w-full bg-[#EDF3FA] border border-slate-200 rounded-xl px-4 py-3.5 text-xs font-medium focus:outline-none focus:border-sky-400 text-slate-800 shadow-inner" />
              </div>
              <button type="submit" className="w-full bg-sky-500 hover:bg-sky-600 text-white font-bold text-xs py-4 rounded-xl transition-colors shadow-md mt-4 uppercase tracking-wider">
                Reset Password
              </button>
            </form>
          )}

          <div className="text-center text-xs text-slate-500 mt-5 font-medium space-y-3">
            {authMode === "signin" && (
              <button type="button" onClick={() => { setAuthMode("forgot"); setAuthError(""); }} className="text-sky-600 underline text-xs font-bold block mx-auto">
                Forgot Password?
              </button>
            )}
            <div>
              {authMode === "signup" ? "Already have an account? " : authMode === "forgot" ? "Remember your password? " : "New here? "}
              <button type="button" onClick={() => { setAuthMode(authMode === "signup" ? "signin" : "signup"); setAuthError(""); }} className="text-sky-600 underline font-bold ml-0.5">
                {authMode === "signup" ? "Sign in" : authMode === "forgot" ? "Sign in" : "Sign up"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- VIEW 3: MAIN SYSTEM DASHBOARD PANEL ---
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#EBF5FB] via-[#D5E6F7] to-[#BACDDF] p-6 flex items-center justify-center text-slate-700">
      <div className="w-full max-w-7xl grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">

        {/* Left Control Panel */}
        <div className="lg:col-span-3 backdrop-blur-md bg-white/40 rounded-[32px] p-6 border border-white/60 shadow-xl flex flex-col justify-between hover:shadow-2xl transition-all duration-300">
          <div>
            <div className="flex items-center gap-2 text-slate-900 font-bold mb-6 text-base">
              <Sparkles className="w-5 h-5 text-sky-600" />
              <span>MindCare AI Hub</span>
            </div>

            <button onClick={handleNewChat} className="w-full bg-[#6589B0] hover:bg-[#52749A] text-white font-bold text-xs py-3 px-4 rounded-xl mb-6 transition-all shadow-sm uppercase tracking-wider flex items-center justify-center gap-2">
              <PlusCircle className="w-4 h-4" />
              <span>New Session</span>
            </button>

            <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-4 ml-1">Real-time History</h4>
            <div className="space-y-3 overflow-y-auto pr-1 max-h-[380px]">
              {chatHistory.length === 0 ? (
                <div className="text-[11px] text-slate-400 italic p-3 text-center bg-white/40 rounded-xl">
                  No active session threads saved yet.
                </div>
              ) : (
                chatHistory.map((item, i) => (
                  <div
                    key={i}
                    onClick={() => setCurrentSessionId(item.session_id)}
                    className={`p-3.5 rounded-2xl border transition-all cursor-pointer shadow-sm ${currentSessionId === item.session_id
                        ? 'bg-white border-sky-400 scale-[1.01]'
                        : 'bg-white/70 hover:bg-white/90 border-white/40'
                      }`}
                  >
                    <span className="block text-xs font-bold text-slate-800 truncate">{item.title}</span>
                    <span className="block text-[9px] text-sky-600 font-mono font-medium mt-0.5 uppercase tracking-tight">Active Room</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-300/40 flex justify-between items-center text-xs font-bold text-slate-600">
            <span className="truncate max-w-[120px]">User: {userSession?.username || "Guest"}</span>
            <button onClick={() => { stopSpeaking(); setUserSession(null); setView("landing"); }} className="text-rose-500 hover:underline">Logout</button>
          </div>
        </div>

        {/* Center Panel: Chat */}
        <div className="lg:col-span-6 backdrop-blur-md bg-white/70 rounded-[32px] shadow-xl flex flex-col border border-white/60 overflow-hidden min-h-[500px] h-[calc(100vh-6rem)] hover:shadow-2xl transition-all duration-300">
          <div className="p-4 bg-white/50 backdrop-blur-sm border-b border-white/60 font-bold text-slate-800 text-sm tracking-wide flex justify-between items-center shadow-sm">
            <span>Clinical Chat Interface</span>
            <div className="flex items-center gap-2">
              {/* Live speaking indicator with stop button */}
              {isSpeaking && (
                <button
                  onClick={stopSpeaking}
                  className="flex items-center gap-1 text-[10px] font-bold bg-sky-100 text-sky-600 border border-sky-200 px-2 py-1 rounded-lg hover:bg-sky-200 transition-all animate-pulse"
                >
                  <span>🔊</span>
                  <span>Speaking... Stop</span>
                </button>
              )}
              <span className="text-[10px] font-mono bg-slate-200/60 px-2 py-0.5 rounded text-slate-500">{currentSessionId.substring(0, 14)}</span>
            </div>
          </div>

          <div className="flex-1 p-5 overflow-y-auto space-y-4 bg-slate-50/20">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.isBot ? 'justify-start' : 'justify-end'} animate-in slide-in-from-bottom-2 duration-300`}>
                {msg.isBot && (
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-sky-100 to-white flex items-center justify-center text-xs mr-2 border border-sky-200 shadow-sm mt-0.5 z-10">🧠</div>
                )}
                <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-[13px] leading-relaxed shadow-md backdrop-blur-sm ${msg.isBot
                    ? 'bg-white/80 text-slate-700 rounded-tl-none border border-white/60 font-medium'
                    : 'bg-gradient-to-r from-[#4FA3F7] to-sky-500 text-white rounded-tr-none border border-sky-400 font-medium'
                  }`}>
                  {msg.isBot ? (
                    <ReactMarkdown
                      components={{
                        strong: ({ node, ...props }) => <strong className="font-extrabold text-slate-900" {...props} />,
                        p: ({ node, ...props }) => <p className="mb-2 last:mb-0" {...props} />,
                        ul: ({ node, ...props }) => <ul className="list-disc pl-4 mb-2 space-y-1" {...props} />,
                        li: ({ node, ...props }) => <li className="" {...props} />
                      }}
                    >
                      {msg.text}
                    </ReactMarkdown>
                  ) : (
                    msg.text
                  )}
                  {/* Re-read aloud button on every bot message */}
                  {msg.isBot && (
                    <button
                      onClick={() => speak(msg.text)}
                      className="block mt-2 text-[10px] text-sky-500 hover:text-sky-700 font-bold uppercase tracking-wider transition-colors flex items-center gap-1 opacity-80 hover:opacity-100"
                    >
                      <span>🔊</span> Read aloud
                    </button>
                  )}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start animate-in fade-in duration-300">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-sky-100 to-white flex items-center justify-center text-xs mr-2 border border-sky-200 shadow-sm mt-0.5 z-10">🧠</div>
                <div className="bg-white/80 rounded-2xl rounded-tl-none px-4 py-3 shadow-md border border-white/60 flex items-center gap-1.5 h-[42px] backdrop-blur-sm">
                  <div className="w-1.5 h-1.5 bg-sky-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                  <div className="w-1.5 h-1.5 bg-sky-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                  <div className="w-1.5 h-1.5 bg-sky-400 rounded-full animate-bounce"></div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={handleSendMessage} className="p-4 border-t border-slate-100 bg-white flex items-center gap-2">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Commence conversational assessment..."
              className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-medium focus:outline-none focus:border-sky-400 text-slate-800"
            />
            <button
              type="button"
              onClick={toggleVoice}
              title={!speechSupported ? "Voice recognition requires HTTPS and browser support" : isListening ? "Stop listening" : "Start voice input"}
              className={`p-3 rounded-xl transition-all ${!speechSupported ? 'bg-slate-50 text-slate-300 cursor-not-allowed' : isListening ? 'bg-rose-500 text-white animate-pulse' : 'bg-slate-100 hover:bg-slate-200 text-slate-500'}`}
              disabled={!speechSupported}
            >
              {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
            <button type="submit" className="p-3 bg-[#4FA3F7] hover:bg-sky-500 text-white rounded-xl transition-colors shadow-md">
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>

        {/* Right Panel: Sentiment */}
        <div className="lg:col-span-3 backdrop-blur-md bg-white/40 rounded-[32px] p-6 shadow-xl border border-white/60 flex flex-col justify-between min-h-[500px] h-[calc(100vh-6rem)] hover:shadow-2xl transition-all duration-300">
          <div>
            <h3 className="font-extrabold text-slate-950 text-base tracking-wide mb-0.5 flex items-center gap-2"><Sparkles className="w-4 h-4 text-sky-500" /> Sentiment Profile</h3>
            <span className="text-[10px] text-slate-500 block mb-6 font-bold uppercase tracking-wider">Real-time analysis counts</span>

            <div className="h-44 flex items-end justify-between gap-4 border-b border-white/40 pb-3 mb-5 px-2 bg-white/40 backdrop-blur-sm p-3 rounded-2xl shadow-inner">
              {moodTrends.map((bar, idx) => {
                const percentageHeight = Math.max(8, (bar.count / getMaxMetricCount()) * 100);
                return (
                  <div key={idx} className="flex flex-col items-center flex-1 group relative h-full justify-end">
                    <div className="absolute -top-8 bg-slate-900 text-white text-[9px] font-bold px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-20 shadow-sm">
                      {bar.count} Instances
                    </div>
                    <div
                      className={`w-full rounded-t-lg transition-all duration-500 bg-gradient-to-t ${bar.color} opacity-90 hover:opacity-100 shadow-sm cursor-pointer`}
                      style={{ height: `${percentageHeight}%` }}
                    />
                    <span className="text-[10px] text-slate-700 mt-2 font-bold tracking-tight">{bar.category}</span>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-around bg-slate-50 rounded-2xl p-3 border border-slate-100 mb-6 shadow-sm">
              <Smile className="w-5 h-5 text-emerald-500 animate-bounce" />
              <Meh className="w-5 h-5 text-amber-500" />
              <Frown className="w-5 h-5 text-rose-400" />
            </div>

            <div className="bg-[#EBF5FB] border border-[#D4EBF7] p-4 rounded-2xl shadow-sm">
              <span className="font-extrabold text-slate-800 text-xs block mb-1">Telemetry Diagnostics</span>
              <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
                These scores evaluate live chat input strings using sentiment lexical distribution formulas.
              </p>
            </div>
          </div>

          <button
            onClick={handleDownloadPDF}
            className="w-full bg-[#1E293B] hover:bg-slate-800 text-white font-bold text-xs py-3.5 rounded-xl transition-colors shadow-md uppercase tracking-wider flex items-center justify-center gap-2"
          >
            <FileText className="w-4 h-4 text-sky-400" />
            <span>Export Therapist Record</span>
          </button>
        </div>

      </div>
    </div>
  );
}
