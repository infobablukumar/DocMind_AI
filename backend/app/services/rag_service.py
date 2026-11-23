import numpy as np
try:
 from sentence_transformers import SentenceTransformer
except Exception: SentenceTransformer=None
_model=None
def model():
 global _model
 if _model is None and SentenceTransformer: _model=SentenceTransformer('all-MiniLM-L6-v2')
 return _model

def retrieve(question,chunks,k=5):
 if not chunks:return []
 m=model()
 if m is None: return chunks[:k]
 texts=[c.content for c in chunks]; em=m.encode(texts,normalize_embeddings=True); q=m.encode([question],normalize_embeddings=True)[0]; scores=np.dot(em,q); ids=np.argsort(scores)[::-1][:k]
 return [chunks[int(i)] for i in ids if scores[int(i)]>0.15]
