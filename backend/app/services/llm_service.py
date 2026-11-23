import requests
from flask import current_app


def _call_ollama(base_url, model, api_key, system, user):
    """Call Ollama via OpenAI-compatible endpoint."""
    url = base_url.rstrip("/") + "/chat/completions"
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    response = requests.post(
        url,
        headers=headers,
        json={
            "model": model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": 0.2,
        },
        timeout=180,
    )
    response.raise_for_status()
    return response.json()["choices"][0]["message"]["content"]


def _call_gemini(api_key, model, system, user):
    """Call Gemini using official Google AI Studio REST API with X-goog-api-key."""
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    headers = {
        "Content-Type": "application/json",
        "X-goog-api-key": api_key,
    }

    prompt_text = f"{system}\n\n{user}" if system else user

    payload = {
        "contents": [
            {
                "parts": [{"text": prompt_text}]
            }
        ],
        "generationConfig": {
            "temperature": 0.2,
        }
    }

    response = requests.post(url, headers=headers, json=payload, timeout=60)
    response.raise_for_status()
    data = response.json()
    return data["candidates"][0]["content"]["parts"][0]["text"]


def complete(system, user):
    """Try the primary LLM (Ollama), fall back to Gemini on failure."""
    primary_url = current_app.config["LLM_BASE_URL"]
    primary_model = current_app.config["LLM_MODEL"]
    primary_key = current_app.config.get("LLM_API_KEY", "")

    gemini_key = current_app.config.get("GEMINI_API_KEY", "")
    gemini_model = current_app.config.get("GEMINI_MODEL", "gemini-2.0-flash")

    # --- Try primary (Ollama) first ---
    try:
        return _call_ollama(primary_url, primary_model, primary_key, system, user)
    except Exception as e:
        current_app.logger.warning(f"Primary LLM failed: {e}")

    # --- Fall back to Gemini ---
    if gemini_key:
        try:
            return _call_gemini(gemini_key, gemini_model, system, user)
        except Exception as e:
            current_app.logger.warning(f"Gemini fallback also failed: {e}")
            raise RuntimeError(f"Both LLMs failed. Ollama error, then Gemini: {e}")

    raise RuntimeError("Primary LLM failed and no GEMINI_API_KEY configured for fallback")