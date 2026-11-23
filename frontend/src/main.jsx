
import React, { useEffect, useState, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import api from './api';
import './style.css';

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [page, setPage] = useState('dashboard');
  const [user, setUser] = useState(null);

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
    setPage('dashboard');
  };

  if (!token) {
    return <Auth onLogin={(t) => {
      localStorage.setItem('token', t);
      setToken(t);
    }} />;
  }

  const pages = {
    dashboard: ['Dashboard', 'Your document workspace'],
    documents: ['Documents', 'Manage your uploaded documents'],
    upload: ['Upload Documents', 'Add files to your knowledge base'],
    chat: ['AI Chat', 'Ask questions about your documents'],
    checks: ['Document Checks', 'Review your document'],
    compare: ['Compare Documents', 'Compare two documents']
  };

  return (
    <div className="app">
      <aside className="main-sidebar">
        <h2>DocMind AI</h2>
        <p>Intelligent Document Assistant</p>
        {Object.entries(pages).map(([key, value]) => (
          <button
            key={key}
            className={page === key ? 'active' : ''}
            onClick={() => setPage(key)}
          >
            {value[0]}
          </button>
        ))}
        <button className="logout-button" onClick={logout}>Logout</button>
      </aside>

      <main className="main-content">
        <header>
          <h1>{pages[page][0]}</h1>
          <p>{pages[page][1]}</p>
        </header>

        {page === 'dashboard' && <Dashboard go={setPage} />}
        {page === 'documents' && <Documents />}
        {page === 'upload' && <Upload />}
        {page === 'chat' && <Chat />}
        {page === 'checks' && <DocChecks />}
        {page === 'compare' && <Compare />}
      </main>
    </div>
  );
}

function Auth({ onLogin }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);

    try {
      const path = mode === 'login' ? '/auth/login' : '/auth/register';
      const body = mode === 'login'
        ? { email, password }
        : { name, email, password };

      const response = await api.post(path, body);
      const data = response.data;
      const token = data.access_token || data.token || data.accessToken;

      if (token) {
        onLogin(token);
      } else if (mode === 'register') {
        setMode('login');
        setError('Registration successful. Please log in.');
      } else {
        setError('Login response did not contain a token.');
      }
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.error || 'Request failed. Check your details and backend.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth card">
      <h1>DocMind AI</h1>
      <p>Sign in to your document workspace</p>
      <form onSubmit={submit}>
        {mode === 'register' && (
          <input
            placeholder="Full name"
            value={name}
            onChange={e => setName(e.target.value)}
            required
          />
        )}
        <input
          type="email"
          placeholder="Email address"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
        />
        <button disabled={busy}>
          {busy ? 'Please wait...' : mode === 'login' ? 'Login' : 'Create account'}
        </button>
      </form>
      {error && <p className="notice">{error}</p>}
      <button className="link-button" onClick={() => {
        setError('');
        setMode(mode === 'login' ? 'register' : 'login');
      }}>
        {mode === 'login' ? 'Create a new account' : 'Already have an account? Login'}
      </button>
    </div>
  );
}

function Dashboard({ go }) {
  return (
    <>
      <div className="grid">
        {[
          ['Documents', 'View your uploaded files', 'documents'],
          ['Upload', 'Add a document for AI analysis', 'upload'],
          ['AI Chat', 'Ask questions about your documents', 'chat'],
          ['Compare', 'Compare document content', 'compare']
        ].map(([title, description, target]) => (
          <div className="card" key={target}>
            <h2>{title}</h2>
            <p>{description}</p>
            <button onClick={() => go(target)}>Open {title}</button>
          </div>
        ))}
      </div>
      <div className="card dashboard-note">
        <h2>Welcome to DocMind AI</h2>
        <p>Upload documents and use AI Chat to ask questions about their content.</p>
      </div>
    </>
  );
}


function Documents() {
  const [docs, setDocs] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [summaryType, setSummaryType] = useState('short');
  const [summary, setSummary] = useState('');
  const [summaryDoc, setSummaryDoc] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const res = await api.get('/documents');
      setDocs(
        Array.isArray(res.data)
          ? res.data
          : res.data.documents || []
      );
    } catch (err) {
      setError(
        err.response?.data?.message ||
        err.response?.data?.error ||
        'Could not load documents.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const summarizeDocument = async (doc) => {
    const documentId = doc.id || doc._id;

    if (!documentId) {
      setError('Document ID not found.');
      return;
    }

    setSummaryLoading(true);
    setError('');
    setSummary('');
    setSummaryDoc(doc);

    try {
      const res = await api.post('/ai/summarize', {
        document_id: documentId,
        type: summaryType
      });

      setSummary(
        res.data.summary || 'No summary was returned.'
      );
    } catch (err) {
      setError(
        err.response?.data?.error ||
        err.response?.data?.message ||
        'Could not generate summary.'
      );
    } finally {
      setSummaryLoading(false);
    }
  };

  return (
    <div className="card">
      <div className="section-title">
        <h2>Your Documents</h2>
        <button onClick={load}>Refresh</button>
      </div>

      {loading && <p>Loading documents...</p>}

      {error && <p className="error-text">{error}</p>}

      {!loading && !error && docs.length === 0 && (
        <p>No documents found yet. Upload a document first.</p>
      )}

      {docs.map((doc, i) => (
        <div className="row" key={doc.id || doc._id || i}>
          <span>
            <strong>
              {doc.filename || doc.name || doc.title || `Document ${i + 1}`}
            </strong>
            <small>{doc.status || doc.created_at || ''}</small>
          </span>

          <button
            onClick={() => summarizeDocument(doc)}
            disabled={summaryLoading}
          >
            Summarize
          </button>
        </div>
      ))}

      {docs.length > 0 && (
        <div className="summary-controls">
          <label htmlFor="summaryType">Summary length:</label>

          <select
            id="summaryType"
            value={summaryType}
            onChange={(e) => setSummaryType(e.target.value)}
            disabled={summaryLoading}
          >
            <option value="short">Short</option>
            <option value="detailed">Detailed</option>
          </select>
        </div>
      )}

      {summaryLoading && (
        <p>Generating summary... Please wait.</p>
      )}

      {summary && summaryDoc && (
        <div className="summary-result">
          <h3>
            Summary: {summaryDoc.filename || summaryDoc.name || summaryDoc.title || 'Selected document'}
          </h3>
          <p style={{ whiteSpace: 'pre-wrap' }}>{summary}</p>
        </div>
      )}
    </div>
  );
}


function Upload() {
  const [file, setFile] = useState(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!file) {
      setMessage('Please choose a file first.');
      return;
    }

    const form = new FormData();
    form.append('file', file);
    setBusy(true);
    setMessage('');

    try {
      const res = await api.post('/documents/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setMessage(res.data.message || 'Upload completed.');
      setFile(null);
      e.target.reset();
    } catch (err) {
      setMessage(err.response?.data?.message || err.response?.data?.error || 'Upload failed. Check your upload API route.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h2>Upload a document</h2>
      <p>Choose a document to add it to your workspace.</p>
      <form onSubmit={submit} className="upload-form">
        <input
          type="file"
          accept=".pdf,.txt,.doc,.docx"
          onChange={e => setFile(e.target.files?.[0] || null)}
          required
        />
        {file && <p>Selected: {file.name}</p>}
        <button disabled={busy}>{busy ? 'Uploading...' : 'Upload Document'}</button>
      </form>
      {message && <p className="notice">{message}</p>}
    </div>
  );
}

function Chat() {
  const [history, setHistory] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState('');
  const [docs, setDocs] = useState([]);
  const [selectedDocs, setSelectedDocs] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);

  const loadHistory = useCallback(async () => {
    try {
      const res = await api.get('/chats');
      setHistory(Array.isArray(res.data) ? res.data : res.data.chats || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load chat history.');
    }
  }, []);

  const loadDocs = useCallback(async () => {
    try {
      const res = await api.get('/documents');
      const list = Array.isArray(res.data) ? res.data : res.data.documents || [];
      setDocs(list);
    } catch {
      setDocs([]);
    }
  }, []);

  useEffect(() => {
    loadHistory();
    loadDocs();
  }, [loadHistory, loadDocs]);

  async function openChat(chat) {
    setActiveChat(chat.id);
    setMessages([]);
    setError('');
    setHistoryOpen(false);

    try {
      const res = await api.get(`/chats/${chat.id}/messages`);
      setMessages((Array.isArray(res.data) ? res.data : res.data.messages || []).map(m => ({
        role: m.role,
        content: m.content,
        sources: m.sources || []
      })));
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load this conversation.');
    }
  }

  function newChat() {
    setActiveChat(null);
    setMessages([]);
    setQuestion('');
    setError('');
    setHistoryOpen(false);
  }

  async function sendQuestion(e) {
    e.preventDefault();
    const text = question.trim();
    if (!text || busy) return;

    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setQuestion('');
    setBusy(true);
    setError('');

    try {
      const res = await api.post('/ai/ask', {
        question: text,
        document_ids: selectedDocs,
        chat_id: activeChat
      });
      const data = res.data;
      const answer = data.answer || data.response || data.message || 'No answer was returned.';
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: answer,
        sources: data.sources || []
      }]);

      if (data.chat_id) {
        setActiveChat(data.chat_id);
      }
      await loadHistory();
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.error || 'Could not get an AI answer.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="chat-workspace">
      <aside className={`history-sidebar ${historyOpen ? 'history-open' : ''}`}>
        <button className="new-chat-button" onClick={newChat}>+ New Chat</button>
        <div className="history-heading">
          <h3>Chat History</h3>
          <button className="refresh-button" onClick={loadHistory} title="Refresh history">↻</button>
        </div>
        {history.length === 0 ? (
          <p className="history-empty">No saved chats yet.</p>
        ) : history.map(chat => (
          <button
            key={chat.id}
            className={`history-item ${String(activeChat) === String(chat.id) ? 'history-active' : ''}`}
            onClick={() => openChat(chat)}
          >
            <span>{chat.title || `Chat ${chat.id}`}</span>
            <small>{chat.created_at ? new Date(chat.created_at).toLocaleString() : ''}</small>
          </button>
        ))}
      </aside>

      <section className="chat-panel">
        <button className="mobile-history-toggle" onClick={() => setHistoryOpen(!historyOpen)}>
          {historyOpen ? 'Close History' : '☰ Chat History'}
        </button>

        <div className="chat-topbar">
          <h2>{activeChat ? 'Conversation' : 'New conversation'}</h2>
          <p>Ask questions about your uploaded documents.</p>
        </div>

        <div className="document-picker">
          <strong>Select documents (optional)</strong>
          <p>Choose which documents the AI should use.</p>
          <div className="document-checks">
            {docs.map((doc, i) => {
              const id = doc.id ?? doc._id;
              if (id == null) return null;
              return (
                <label className="check" key={id}>
                  <input
                    type="checkbox"
                    checked={selectedDocs.some(x => String(x) === String(id))}
                    onChange={e => setSelectedDocs(prev =>
                      e.target.checked
                        ? [...prev, id]
                        : prev.filter(x => String(x) !== String(id))
                    )}
                  />
                  <span>{doc.filename || doc.name || doc.title || `Document ${i + 1}`}</span>
                </label>
              );
            })}
          </div>
        </div>

        {error && <p className="error-text">{error}</p>}

        <div className="messages-area">
          {messages.length === 0 ? (
            <div className="chat-welcome">
              <h2>How can I help you?</h2>
              <p>Ask a question about your documents to get started.</p>
            </div>
          ) : messages.map((msg, i) => (
            <div className={`message ${msg.role === 'user' ? 'user-message' : 'assistant-message'}`} key={i}>
              <strong>{msg.role === 'user' ? 'You' : 'DocMind AI'}</strong>
              <p>{msg.content}</p>
              {msg.sources?.length > 0 && (
                <div className="sources">
                  <strong>Sources</strong>
                  {msg.sources.map((source, j) => (
                    <span className="source" key={j}>
                      {typeof source === 'string'
                        ? source
                        : source.filename || source.document_name || source.name || `Source ${j + 1}`}
                      {source.page ? ` — Page ${source.page}` : ''}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
          {busy && <p className="notice">DocMind AI is thinking...</p>}
        </div>

        <form className="chat-input-area" onSubmit={sendQuestion}>
          <textarea
            value={question}
            onChange={e => setQuestion(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder="Ask something about your documents... (Enter to send)"
            rows={3}
          />
          <div className="chat-input-footer">
            <small>Shift + Enter for a new line</small>
            <button disabled={busy || !question.trim()}>
              {busy ? 'Thinking...' : 'Send'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function DocChecks() {
  const [text, setText] = useState('');
  const [result, setResult] = useState('');
  const [busy, setBusy] = useState(false);

  async function runCheck(e) {
    e.preventDefault();
    setBusy(true);
    setResult('');
    try {
      const res = await api.post('/ai/check', { text });
      setResult(res.data.result || res.data.answer || res.data.message || JSON.stringify(res.data, null, 2));
    } catch (err) {
      setResult(err.response?.data?.message || 'Document check failed. Confirm the backend endpoint.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h2>Document Checks</h2>
      <form onSubmit={runCheck}>
        <textarea value={text} onChange={e => setText(e.target.value)} placeholder="Paste text to review..." required />
        <button disabled={busy}>{busy ? 'Checking...' : 'Check Document'}</button>
      </form>
      {result && <div className="answer">{result}</div>}
    </div>
  );
}

function Compare() {
  const [first, setFirst] = useState('');
  const [second, setSecond] = useState('');
  const [result, setResult] = useState('');
  const [busy, setBusy] = useState(false);

  async function compare(e) {
    e.preventDefault();
    setBusy(true);
    setResult('');
    try {
      const res = await api.post('/ai/compare', {
        document1: first,
        document2: second
      });
      setResult(res.data.result || res.data.answer || res.data.comparison || JSON.stringify(res.data, null, 2));
    } catch (err) {
      setResult(err.response?.data?.message || 'Comparison failed. Confirm the backend endpoint.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h2>Compare Documents</h2>
      <form onSubmit={compare}>
        <label>First document text</label>
        <textarea value={first} onChange={e => setFirst(e.target.value)} required />
        <label>Second document text</label>
        <textarea value={second} onChange={e => setSecond(e.target.value)} required />
        <button disabled={busy}>{busy ? 'Comparing...' : 'Compare'}</button>
      </form>
      {result && <div className="answer">{result}</div>}
    </div>
  );
}
createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);
