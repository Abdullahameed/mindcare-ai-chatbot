"use client";
import React, { useState, useEffect, useRef } from 'react';
import { 
  Mic, MicOff, Send, Smile, Meh, Frown, FileText, Sparkles, PlusCircle, 
  ArrowRight, Clock, Volume2, Download, LogOut, HeartPulse, Lock, User, Bot, Activity 
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';

const getApiUrl = () => {
  if (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  if (typeof window !== 'undefined' && window.location.hostname) {
    if (window.location.hostname.includes('vercel.app')) {
      return 'http://127.0.0.1:8000'; 
    }
    return `http://${window.location.hostname}:8000`;
  }
  return 'http://127.0.0.1:8000';
};

export default function MindEaseApp() {
  const [view, setView] = useState("landing");
  const [authMode, setAuthMode] = useState("signup");

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [userSession, setUserSession] = useState(null);
  const [currentSessionId, setCurrentSessionId] = useState("");
  const [authError, setAuthError] = useState("");
  const [resetUsername, setResetUsername] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [speechSupported, setSpeechSupported] = useState(true);

  useEffect(() => {
    setCurrentSessionId("session_" + Date.now());
  }, []);

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
    { category: "Happy", count: 0, color: "from-emerald-400 to-emerald-500", sentiment: "positive" },
    { category: "Neutral", count: 0, color: "from-amber-400 to-amber-500", sentiment: "neutral" },
    { category: "Sad", count: 0, color: "from-rose-400 to-rose-500", sentiment: "negative" }
  ]);
  const [currentMood, setCurrentMood] = useState("neutral");

  const recognitionRef = useRef(null);
  const messagesEndRef = useRef(null);
  const prevTrendsRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const fetchAnalytics = async (id) => {
    try {
      const res = await fetch(`${getApiUrl()}/api/mood-analytics/${id}`);
      const data = await res.json();
      if (data.metrics) {
        let newMood = null;

        if (prevTrendsRef.current) {
          for (const m of data.metrics) {
            const oldM = prevTrendsRef.current.find(p => p.category === m.category);
            if (oldM && m.count > oldM.count) {
              if (m.category === "Happy") newMood = "positive";
              if (m.category === "Neutral") newMood = "neutral";
              if (m.category === "Sad") newMood = "negative";
            }
          }
        }

        if (newMood) {
          setCurrentMood(newMood);
        }

        prevTrendsRef.current = data.metrics;

        setMoodTrends(prev => prev.map(trend => {
          const match = data.metrics.find(m => m.category === trend.category);
          return { ...trend, count: match ? match.count : 0 };
        }));
      }
    } catch (err) {
      console.log("Analytics aggregation sync fallback processed.");
    }
  };

  const fetchHistory = async (id) => {
    try {
      const res = await fetch(`${getApiUrl()}/api/chat/history/${id}`);
      const data = await res.json();
      if (data.history) {
        setChatHistory(data.history);
      }
    } catch (err) {
      console.log("History sidebar sync execution error.");
    }
  };

  const handleNewChat = () => {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
    setCurrentSessionId("session_" + Date.now());
    setMessages([
      { text: "New session active. How can I assist your wellness progression today?", isBot: true }
    ]);
  };

  const speak = (text) => {
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) return;
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

  const stopSpeaking = () => {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  };

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
      const res = await fetch(`${getApiUrl()}/api/auth/${endpoint}`, {
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
      const res = await fetch(`${getApiUrl()}/api/auth/reset-password`, {
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
      const response = await fetch(`${getApiUrl()}/api/chat`, {
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

      setMessages(prev => [...prev, { text: data.response, isBot: true }]);
      setIsLoading(false);
      speak(data.response);
      fetchAnalytics(userSession.user_id);
      fetchHistory(userSession.user_id);
    } catch (error) {
      console.error("Chat pipeline error:", error);
      setIsLoading(false);
      setMessages(prev => [...prev, { text: "Error maintaining connection pipeline with RAG instance server.", isBot: true }]);
    }
  };

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
        setSpeechSupported(false);
      }
    }
  };

  const handleDownloadPDF = () => {
    if (!userSession) return;
    window.location.href = `${getApiUrl()}/api/export-report/${userSession.user_id}`;
  };

  const handleLogout = () => {
    stopSpeaking();
    setUserSession(null);
    setCurrentMood("neutral");
    prevTrendsRef.current = null;
    setView("landing");
  };

  // --- VIEW 1: LANDING INTERFACE ---
  if (view === "landing") {
    return (
      <div className="min-h-screen bg-slate-100 text-on-surface font-body-md relative overflow-hidden flex flex-col w-full h-full">
        <div className="fixed inset-0 pointer-events-none overflow-hidden z-0 bg-slate-100 w-full h-full">
          <div className="absolute top-[-10%] right-[-10%] w-[50vw] h-[50vw] max-w-[600px] max-h-[600px] rounded-full bg-teal-100/40 blur-[100px] opacity-70"></div>
          <div className="absolute bottom-[-10%] left-[-10%] w-[60vw] h-[60vw] max-w-[700px] max-h-[700px] rounded-full bg-teal-50/60 blur-[120px] opacity-60"></div>
        </div>

        <header className="relative z-10 flex justify-between items-center w-full px-8 md:px-12 py-6 max-w-[1200px] mx-auto">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center">
              <Activity className="w-6 h-6 text-teal-700" />
            </div>
            <span className="text-[24px] font-bold text-teal-800">MindEase</span>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => { setAuthMode("signin"); setView("auth"); }} className="text-sm font-semibold text-slate-600 hover:text-teal-700 transition-colors">Log in</button>
            <button onClick={() => { setAuthMode("signup"); setView("auth"); }} className="bg-teal-700 text-white px-5 py-2.5 rounded-xl font-semibold hover:bg-teal-800 transition-colors duration-200 shadow-sm text-sm">Start Chatting</button>
          </div>
        </header>

        <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 mt-4 md:mt-8 mb-16">
          <h1 className="text-4xl md:text-5xl font-bold text-slate-800 text-center mb-6 tracking-tight">Your Mind Matters.</h1>
          <p className="text-lg text-slate-500 text-center max-w-lg mb-12">
            A private, AI-powered companion to combine with therapy, tracking mental health and wellness in a compassionate, clinical space.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto px-4 sm:px-0">
            <button onClick={() => { setAuthMode("signup"); setView("auth"); }} className="w-full sm:w-auto bg-teal-700 text-white font-semibold px-6 py-3 rounded-xl hover:bg-teal-800 transition-all duration-200 shadow-md flex items-center justify-center">
              Get Started
              <ArrowRight className="w-5 h-5 ml-2" />
            </button>
            <button onClick={() => { setAuthMode("signin"); setView("auth"); }} className="w-full sm:w-auto bg-transparent border-2 border-teal-700 text-teal-700 font-semibold px-6 py-3 rounded-xl hover:bg-teal-50 transition-colors duration-200 shadow-sm flex items-center justify-center">
              Welcome Back
            </button>
          </div>
        </main>
      </div>
    );
  }

  // --- VIEW 2: AUTHENTICATION INTERFACE ---
  if (view === "auth") {
    return (
      <div className="min-h-screen bg-slate-100 text-slate-800 flex items-center justify-center relative overflow-hidden font-body-md">
        <div className="fixed inset-0 pointer-events-none overflow-hidden z-0 bg-slate-100 w-full h-full">
          <div className="absolute top-[-10%] right-[-10%] w-[50vw] h-[50vw] max-w-[600px] max-h-[600px] rounded-full bg-teal-100/40 blur-[100px] opacity-70"></div>
          <div className="absolute bottom-[-10%] left-[-10%] w-[60vw] h-[60vw] max-w-[700px] max-h-[700px] rounded-full bg-teal-50/60 blur-[120px] opacity-60"></div>
        </div>
        
        <main className="relative z-10 w-full max-w-sm px-4 py-8 mx-auto">
          <div className="bg-white rounded-2xl p-8 shadow-lg border border-slate-100">
            
            <div className="text-center mb-8 flex flex-col items-center">
              <div className="w-16 h-16 rounded-full bg-teal-100 flex items-center justify-center mb-4 shadow-sm">
                <Activity className="w-8 h-8 text-teal-700" />
              </div>
              <h1 className="text-3xl font-bold text-teal-800 mb-2 tracking-tight">
                {authMode === "signup" ? "Join MindEase" : authMode === "forgot" ? "Reset Password" : "Welcome Back"}
              </h1>
              <p className="text-sm text-slate-500 max-w-[280px]">
                {authMode === "signup" ? "Create an account to begin your journey." : authMode === "forgot" ? "Enter your new credentials below." : "Please sign in to continue your wellness journey."}
              </p>
            </div>

            {authError && (
              <div className="bg-red-50 text-red-600 text-sm font-medium p-4 rounded-xl mb-6 text-center border border-red-100">
                {authError}
              </div>
            )}

            {authMode !== "forgot" ? (
              <form onSubmit={handleAuthSubmit} className="flex flex-col gap-5">
                <div className="flex flex-col gap-1.5">
                  <label className="font-semibold text-sm text-slate-700" htmlFor="username">Username</label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 z-10 pointer-events-none" />
                    <input type="text" id="username" value={username} onChange={e => setUsername(e.target.value)} className="w-full h-12 pl-10 pr-4 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 transition-all duration-200" placeholder="Enter username" required />
                  </div>
                </div>
                
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between items-center">
                    <label className="font-semibold text-sm text-slate-700" htmlFor="password">Password</label>
                    {authMode === "signin" && (
                      <button type="button" onClick={() => { setAuthMode("forgot"); setAuthError(""); }} className="text-sm font-semibold text-teal-600 hover:underline transition-colors text-right">Forgot Password?</button>
                    )}
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 z-10 pointer-events-none" />
                    <input type="password" id="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full h-12 pl-10 pr-4 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 transition-all duration-200" placeholder="••••••••" required />
                  </div>
                </div>

                <div className="mt-2">
                  <button type="submit" className="w-full bg-teal-700 text-white rounded-xl px-6 py-3 font-semibold hover:bg-teal-800 transition-colors duration-200 shadow-sm flex items-center justify-center">
                    {authMode === "signup" ? "Sign Up" : "Sign In"}
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleResetSubmit} className="flex flex-col gap-5">
                <div className="flex flex-col gap-1.5">
                  <label className="font-semibold text-sm text-slate-700" htmlFor="resetUsername">Username</label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 z-10 pointer-events-none" />
                    <input type="text" id="resetUsername" value={resetUsername} onChange={e => setResetUsername(e.target.value)} className="w-full h-12 pl-10 pr-4 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 transition-all duration-200" placeholder="Enter username" required />
                  </div>
                </div>
                
                <div className="flex flex-col gap-1.5">
                  <label className="font-semibold text-sm text-slate-700" htmlFor="resetPassword">New Password</label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 z-10 pointer-events-none" />
                    <input type="password" id="resetPassword" value={resetPassword} onChange={e => setResetPassword(e.target.value)} className="w-full h-12 pl-10 pr-4 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 transition-all duration-200" placeholder="••••••••" required />
                  </div>
                </div>

                <div className="mt-2">
                  <button type="submit" className="w-full bg-teal-700 text-white rounded-xl px-6 py-3 font-semibold hover:bg-teal-800 transition-colors duration-200 shadow-sm flex items-center justify-center gap-2">
                    Reset Password
                  </button>
                </div>
              </form>
            )}

            <div className="mt-8 pt-6 border-t border-slate-100 text-center">
              <p className="text-sm text-slate-500">
                {authMode === "signup" ? "Already have an account? " : authMode === "forgot" ? "Remember your password? " : "Don't have an account? "}
                <button type="button" onClick={() => { setAuthMode(authMode === "signup" ? "signin" : authMode === "forgot" ? "signin" : "signup"); setAuthError(""); }} className="text-sm font-semibold text-teal-600 hover:underline transition-colors ml-1">
                  {authMode === "signup" ? "Sign in here" : authMode === "forgot" ? "Sign in here" : "Create one here"}
                </button>
              </p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // --- VIEW 3: MAIN SYSTEM DASHBOARD PANEL ---
  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-800 font-body-md selection:bg-teal-100 selection:text-teal-900">
      {/* Left Navigation Sidebar */}
      <aside className="w-[300px] bg-white border-r border-slate-200 hidden lg:flex flex-col h-full shrink-0 shadow-sm relative z-20">
        <div className="p-5 flex items-center gap-3 border-b border-slate-100">
            <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center shadow-sm flex-shrink-0">
                <Activity className="w-5 h-5 text-teal-700" />
            </div>
            <div>
                <h1 className="text-[17px] font-bold text-teal-800 tracking-tight leading-tight">MindEase</h1>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Therapeutic Session</p>
            </div>
        </div>
        
        <div className="p-5 flex-1 overflow-y-auto chat-scroll flex flex-col gap-2">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1 px-2">Welcome</div>
            <div className="px-4 py-3 rounded-xl bg-slate-50 text-slate-800 mb-4 border border-slate-100">
              <div className="text-sm font-semibold mb-1">{userSession?.username || 'Guest'}</div>
              <div className="text-xs text-slate-500">User ID: {userSession?.user_id?.substring(0,8)}...</div>
            </div>

            <button onClick={handleNewChat} className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-700 font-semibold text-sm w-full transition-colors mb-4 cursor-pointer">
                <PlusCircle className="w-5 h-5 flex-shrink-0" />
                New Session
            </button>

            <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1 px-2 mt-2">Session History</div>
            <div className="flex-1 overflow-y-auto chat-scroll pr-2 mb-4 space-y-1">
              {chatHistory.length === 0 ? (
                <div className="text-sm text-slate-400 italic px-2 py-2">No past sessions found.</div>
              ) : (
                chatHistory.map((item, i) => (
                  <button 
                    key={i}
                    onClick={() => setCurrentSessionId(item.session_id)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-left w-full transition-colors cursor-pointer ${
                      currentSessionId === item.session_id 
                        ? 'bg-teal-50 text-teal-700 font-semibold' 
                        : 'hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    <Clock className="w-5 h-5 flex-shrink-0" />
                    <span className="text-sm truncate">{item.title}</span>
                  </button>
                ))
              )}
            </div>
            
            <div className="mt-auto pt-4 border-t border-slate-100 flex flex-col gap-1">
                <button onClick={handleDownloadPDF} className="flex items-center gap-2 px-3 py-2.5 rounded-lg hover:bg-teal-50 text-slate-600 hover:text-teal-700 font-semibold text-sm w-full transition-colors cursor-pointer">
                    <Download className="w-5 h-5 flex-shrink-0" />
                    Export Report
                </button>
                <button onClick={handleLogout} className="flex items-center gap-2 px-3 py-2.5 rounded-lg hover:bg-red-50 text-slate-600 hover:text-red-600 font-semibold text-sm w-full transition-colors cursor-pointer">
                    <LogOut className="w-5 h-5 flex-shrink-0" />
                    Sign Out
                </button>
            </div>
        </div>
      </aside>

      {/* Center Chat Panel */}
      <main className="flex-1 flex flex-col h-full bg-slate-50 relative min-w-0 border-r border-slate-200">
        
        {/* Mobile Header */}
        <header className="lg:hidden p-4 border-b border-slate-200 flex items-center justify-between bg-white z-10 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center">
              <Activity className="w-4 h-4 text-teal-700" />
            </div>
            <span className="font-bold text-teal-800">MindEase</span>
          </div>
          <button onClick={handleLogout} className="text-slate-500">
            <LogOut className="w-5 h-5" />
          </button>
        </header>

        {/* Chat Scroll Area */}
        <div className="flex-1 overflow-y-auto chat-scroll p-4 md:p-8 relative z-10 flex flex-col gap-6">
          <div className="text-center my-4">
              <span className="inline-block px-3 py-1 rounded-full bg-slate-200/60 text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                  Session Started
              </span>
          </div>

          {messages.map((msg, index) => (
            <div key={index} className={`flex w-full ${!msg.isBot ? 'justify-end' : 'justify-start'}`}>
              <div className={`flex items-end gap-3 max-w-[85%] sm:max-w-[75%] ${!msg.isBot && 'flex-row-reverse'}`}>
                {msg.isBot && (
                  <div className="w-8 h-8 rounded-full bg-teal-100 text-teal-700 flex-shrink-0 flex items-center justify-center shadow-sm">
                      <Bot className="w-5 h-5" />
                  </div>
                )}
                
                <div className="flex flex-col">
                  <div className={`px-4 py-3 text-[15px] shadow-sm relative ${
                    !msg.isBot 
                      ? 'bg-teal-600 text-white rounded-2xl rounded-tr-sm' 
                      : 'bg-white border border-slate-100 text-slate-800 rounded-2xl rounded-tl-sm'
                  }`}>
                    {msg.isBot ? (
                      <ReactMarkdown
                        components={{
                          strong: ({ node, ...props }) => <strong className="font-semibold" {...props} />,
                          p: ({ node, ...props }) => <p className="mb-2 last:mb-0" {...props} />,
                          ul: ({ node, ...props }) => <ul className="list-disc pl-5 mb-2 space-y-1" {...props} />,
                          li: ({ node, ...props }) => <li className="" {...props} />
                        }}
                      >
                        {msg.text}
                      </ReactMarkdown>
                    ) : (
                      msg.text
                    )}
                  </div>
                  {msg.isBot && (
                    <button
                      onClick={() => speak(msg.text)}
                      className="mt-2 text-[11px] text-slate-400 hover:text-teal-600 font-semibold transition-colors flex items-center gap-1.5 w-fit ml-1"
                    >
                      <Volume2 className="w-3.5 h-3.5" /> Read aloud
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex w-full justify-start">
              <div className="flex items-end gap-3 max-w-[75%]">
                <div className="w-8 h-8 rounded-full bg-teal-100 text-teal-700 flex-shrink-0 flex items-center justify-center shadow-sm">
                    <Bot className="w-5 h-5" />
                </div>
                <div className="px-4 py-4 rounded-2xl rounded-tl-sm bg-white border border-slate-100 shadow-sm flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-bounce" style={{animationDelay: '0ms'}}></div>
                    <div className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-bounce" style={{animationDelay: '150ms'}}></div>
                    <div className="w-1.5 h-1.5 rounded-full bg-teal-600 animate-bounce" style={{animationDelay: '300ms'}}></div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 bg-white border-t border-slate-100 relative z-10 flex flex-col gap-2 sticky bottom-0">
          {isSpeaking && (
            <div className="flex justify-center -mt-2 mb-1">
              <button
                onClick={stopSpeaking}
                className="flex items-center gap-1.5 text-xs font-bold bg-teal-50 text-teal-600 border border-teal-100 px-3 py-1.5 rounded-lg hover:bg-teal-100 transition-colors animate-pulse"
              >
                <div className="w-2 h-2 rounded-full bg-teal-600"></div> Stop reading
              </button>
            </div>
          )}
          <form onSubmit={handleSendMessage} className="max-w-4xl mx-auto w-full relative flex items-center gap-2">
            <button
              type="button"
              onClick={toggleVoice}
              title={!speechSupported ? "Voice recognition requires HTTPS and browser support" : isListening ? "Stop listening" : "Start voice input"}
              className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-colors border-none ${
                !speechSupported 
                  ? 'text-slate-300 cursor-not-allowed' 
                  : isListening 
                    ? 'bg-red-50 text-red-500 animate-pulse' 
                    : 'bg-transparent hover:bg-slate-100 text-slate-500 cursor-pointer'
              }`}
              disabled={!speechSupported}
            >
              {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>
            <div className="flex-1 relative flex items-center bg-slate-50 border border-slate-200 rounded-full pl-4 pr-1.5 h-12 shadow-sm focus-within:border-teal-500 focus-within:ring-2 focus-within:ring-teal-500/20 transition-all">
              <input 
                type="text" 
                value={inputMessage} 
                onChange={e => setInputMessage(e.target.value)} 
                placeholder="Share how you're feeling today..." 
                className="w-full bg-transparent border-none focus:outline-none text-slate-700 placeholder:text-slate-400 h-full text-[15px]"
                disabled={isLoading}
              />
              <button 
                type="submit" 
                disabled={isLoading}
                className="flex-shrink-0 w-9 h-9 rounded-full bg-teal-600 text-white flex items-center justify-center hover:bg-teal-700 shadow-sm transition-transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ml-2"
              >
                <Send className="w-4 h-4 ml-0.5" />
              </button>
            </div>
          </form>
          <div className="text-center mt-1">
              <span className="text-[10px] text-slate-400">
                  MindEase may produce inaccurate information. Consult a healthcare professional for medical advice.
              </span>
          </div>
        </div>
      </main>

      {/* Right Column: Mood Dashboard */}
      <aside className="w-[320px] bg-white hidden xl:flex flex-col h-full shrink-0 relative z-20 overflow-y-auto chat-scroll border-l border-slate-200">
        <div className="p-6 flex flex-col gap-6">
            
            <header>
                <h2 className="text-xl font-bold text-teal-800 mb-0.5">Clinical Dashboard</h2>
                <p className="text-xs text-slate-500 font-medium">Real-time analytical sentiment tracking</p>
            </header>

            {/* Current Sentiment Card */}
            <div className="bg-white border border-slate-100 rounded-xl p-5 shadow-sm relative overflow-hidden flex flex-col gap-1">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                    <HeartPulse className="w-4 h-4 text-teal-600" />
                    CURRENT STATE
                </div>
                
                <div className="text-3xl font-bold text-slate-800 capitalize tracking-tight">
                    {currentMood}
                </div>
                <p className="text-xs text-slate-500 mt-1">Latest interaction analysis</p>
            </div>

            {/* Tracking Overview Bento */}
            <div>
                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">TRACKING OVERVIEW</h3>
                <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm flex flex-col items-center gap-1">
                        <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center mb-1">
                            <Smile className="w-6 h-6 text-green-500" />
                        </div>
                        <div className="text-2xl font-bold text-slate-800 leading-none">{moodTrends.find(m => m.sentiment === 'positive')?.count || 0}</div>
                        <div className="text-[11px] font-medium text-slate-500 text-center">Positive Events</div>
                    </div>
                    
                    <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm flex flex-col items-center gap-1">
                        <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center mb-1">
                            <Frown className="w-6 h-6 text-red-400" />
                        </div>
                        <div className="text-2xl font-bold text-slate-800 leading-none">{moodTrends.find(m => m.sentiment === 'negative')?.count || 0}</div>
                        <div className="text-[11px] font-medium text-slate-500 text-center">Negative Events</div>
                    </div>
                </div>
            </div>

            {/* Distribution Graph */}
            <div>
                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">DISTRIBUTION</h3>
                <div className="bg-white border border-slate-100 rounded-xl p-5 shadow-sm">
                    <div className="flex flex-col gap-4">
                        {moodTrends.map(m => {
                          const maxCount = Math.max(...moodTrends.map(x => x.count), 0) || 1;
                          const percent = Math.round((m.count / maxCount) * 100) || 0;
                          return (
                            <div key={m.sentiment} className="flex items-center gap-3">
                                <div className="w-14 text-xs font-semibold text-slate-600 capitalize">{m.sentiment}</div>
                                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                                    <div 
                                      className={`h-full rounded-full transition-all duration-500 ${
                                        m.sentiment === 'positive' ? 'bg-green-400' :
                                        m.sentiment === 'negative' ? 'bg-red-400' :
                                        'bg-amber-400'
                                      }`} 
                                      style={{ width: `${percent}%` }}
                                    ></div>
                                </div>
                                <div className="w-6 text-right text-xs font-bold text-slate-500">{m.count}</div>
                            </div>
                          )
                        })}
                    </div>
                </div>
            </div>

        </div>
      </aside>

    </div>
  );
}
