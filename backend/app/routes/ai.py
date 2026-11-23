
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from ..extensions import db
from ..models import (
    Document, DocumentChunk, Summary, Chat, Message
)
from ..services.rag_service import retrieve
from ..services.llm_service import complete
import json

bp = Blueprint('ai', __name__, url_prefix='/api/ai')


def owned(ids, uid):
    return Document.query.filter(
        Document.id.in_(ids),
        Document.user_id == uid
    ).all()


@bp.post('/ask')
@jwt_required()
def ask():
    data = request.get_json() or {}

    try:
        ids = list(dict.fromkeys(
            int(x) for x in data.get('document_ids', [])
        ))
        chat_id = data.get('chat_id')
        chat_id = int(chat_id) if chat_id not in (None, '') else None
    except (TypeError, ValueError):
        return jsonify(error='Invalid document_ids or chat_id'), 400

    question = (data.get('question') or '').strip()
    uid = int(get_jwt_identity())

    if not ids or not question:
        return jsonify(
            error='document_ids and question are required'
        ), 400

    # Verify that all selected documents belong to this user.
    docs = owned(ids, uid)
    if len(docs) != len(ids):
        return jsonify(error='Unauthorized or missing document'), 403

    # Load the existing conversation, if one was selected.
    chat = None
    if chat_id is not None:
        chat = Chat.query.filter_by(
            id=chat_id,
            user_id=uid
        ).first()

        if not chat:
            return jsonify(error='Chat not found'), 404

    chunks = DocumentChunk.query.filter(
        DocumentChunk.document_id.in_(ids)
    ).all()

    hits = retrieve(question, chunks)

    if not hits:
        return jsonify(
            answer='I could not find sufficient information in the selected document(s).',
            sources=[],
            chat_id=chat.id if chat else None
        ), 200

    names = {doc.id: doc.original_filename for doc in docs}

    context = '\n\n'.join(
        f'[Source: {names[h.document_id]}, page {h.page_number}] '
        f'{h.content}'
        for h in hits
    )

    # Include recent messages so follow-up questions have context.
    history_text = ''

    if chat:
        previous_messages = (
            Message.query
            .filter_by(chat_id=chat.id)
            .order_by(Message.created_at.desc())
            .limit(10)
            .all()
        )
        previous_messages.reverse()

        history_text = '\n'.join(
            f"{'User' if m.role == 'user' else 'Assistant'}: "
            f"{m.content}"
            for m in previous_messages
        )

    system_prompt = (
        'You are DocMind AI, a document question-answering assistant. '
        'Use the supplied document context to answer accurately. '
        'Use conversation history to understand follow-up questions. '
        'For factual claims about the selected documents, rely on the '
        'supplied context. If the answer is not supported, say so. '
        'Cite relevant source filenames and page numbers when possible.'
    )

    user_prompt = f"""
Recent conversation:
{history_text or 'No previous conversation.'}

Selected document context:
{context}

Current question:
{question}
"""

    try:
        answer = complete(system_prompt, user_prompt)
    except Exception as e:
        return jsonify(
            error=f'AI service failed: {e}'
        ), 503

    sources = [
        {
            'document': names[h.document_id],
            'document_id': h.document_id,
            'page': h.page_number,
            'excerpt': h.content[:240]
        }
        for h in hits
    ]

    try:
        # Create a new chat only when no existing chat was selected.
        if chat is None:
            chat = Chat(
                user_id=uid,
                title=question[:100]
            )
            db.session.add(chat)
            db.session.flush()

        db.session.add_all([
            Message(
                chat_id=chat.id,
                role='user',
                content=question
            ),
            Message(
                chat_id=chat.id,
                role='assistant',
                content=answer,
                sources_json=json.dumps(sources)
            )
        ])

        db.session.commit()

    except Exception:
        db.session.rollback()
        return jsonify(error='Could not save the conversation'), 500

    return jsonify(
        answer=answer,
        sources=sources,
        chat_id=chat.id
    )


@bp.post('/summarize')
@jwt_required()
def summarize():
    data = request.get_json() or {}

    try:
        document_id = int(data.get('document_id', 0))
    except (TypeError, ValueError):
        return jsonify(error='Invalid document_id'), 400

    summary_type = data.get('type', 'short')
    uid = int(get_jwt_identity())

    doc = Document.query.filter_by(
        id=document_id,
        user_id=uid
    ).first()

    if not doc:
        return jsonify(error='Document not found'), 404

    cached = Summary.query.filter_by(
        document_id=document_id,
        summary_type=summary_type
    ).first()

    if cached:
        return jsonify(summary=cached.content, cached=True)

    text = '\n'.join(
        chunk.content
        for chunk in DocumentChunk.query.filter_by(
            document_id=document_id
        ).limit(5)
    )

    try:
        result = complete(
            'Summarize only the supplied document text.',
            f'Create a {summary_type} summary:\n{text}'
        )
    except Exception as e:
        return jsonify(error=f'AI service failed: {e}'), 503

    db.session.add(Summary(
        document_id=document_id,
        summary_type=summary_type,
        content=result
    ))
    db.session.commit()

    return jsonify(summary=result, cached=False)


@bp.post('/extract')
@jwt_required()
def extract_info():
    data = request.get_json() or {}

    try:
        document_id = int(data.get('document_id', 0))
    except (TypeError, ValueError):
        return jsonify(error='Invalid document_id'), 400

    uid = int(get_jwt_identity())

    doc = Document.query.filter_by(
        id=document_id,
        user_id=uid
    ).first()

    if not doc:
        return jsonify(error='Document not found'), 404

    text = '\n'.join(
        chunk.content
        for chunk in DocumentChunk.query.filter_by(
            document_id=document_id
        ).limit(10)
    )

    try:
        result = complete(
            'Return valid JSON with keys organizations, people, dates, '
            'deadlines, requirements, important_numbers, key_topics, '
            'action_items. Use only supplied text.',
            text
        )
        return jsonify(result=result)
    except Exception as e:
        return jsonify(error=f'AI service failed: {e}'), 503


@bp.post('/compare')
@jwt_required()
def compare():
    data = request.get_json() or {}
    uid = int(get_jwt_identity())

    # Option A: User pasted raw text in the frontend boxes
    doc1_text = (data.get('document1') or '').strip()
    doc2_text = (data.get('document2') or '').strip()

    if doc1_text and doc2_text:
        parts = [
            f"DOCUMENT 1:\n{doc1_text}",
            f"DOCUMENT 2:\n{doc2_text}"
        ]
    else:
        # Option B: User passed document database IDs
        try:
            ids = list(dict.fromkeys(
                int(x) for x in data.get('document_ids', [])
            ))
        except (TypeError, ValueError):
            return jsonify(error='Invalid document_ids or document text required'), 400

        if len(ids) != 2:
            return jsonify(error='Select exactly two documents or provide two texts to compare'), 400

        docs = owned(ids, uid)
        if len(docs) != 2:
            return jsonify(error='Unauthorized or missing document'), 403

        parts = []
        for doc in docs:
            text = '\n'.join(
                chunk.content
                for chunk in DocumentChunk.query.filter_by(
                    document_id=doc.id
                ).limit(10)
            )
            parts.append(f'DOCUMENT {doc.original_filename}:\n{text}')

    system_prompt = (
        'Compare the supplied documents/texts. Cover main topics, '
        'similarities, differences, key facts, requirements, dates, '
        'and contradictions in a clean, structured report.'
    )

    try:
        result = complete(system_prompt, '\n\n'.join(parts))
        return jsonify(comparison=result, result=result)
    except Exception as e:
        return jsonify(error=f'AI service failed: {e}'), 503

@bp.post('/check')
@jwt_required()
def check_document():
    data = request.get_json() or {}
    text = (data.get('text') or '').strip()

    if not text:
        return jsonify(error='Text is required for document check'), 400

    system_prompt = (
        'You are a professional document reviewer and editor. '
        'Analyze the supplied text for grammar, clarity, readability, '
        'structure, tone, and potential factual or logical inconsistencies. '
        'Provide actionable feedback and a clean revision.'
    )

    try:
        result = complete(system_prompt, text)
        return jsonify(result=result)
    except Exception as e:
        return jsonify(error=f'AI service failed: {e}'), 503