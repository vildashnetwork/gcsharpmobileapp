import io
p = 'server_sqlite_full_corrected.py'
src = io.open(p, encoding='utf-8').read()

ai_helpers = '''

async def _reply_group_ai(group: dict, trigger_msg: dict, asker: dict) -> dict:
    question = (trigger_msg.get("text") or "").strip()
    if question.lower().startswith("@ai"):
        question = question[3:].strip()
    if not question:
        return {}
    await _broadcast_group(group["group_id"], {"type": "ai_typing", "typing": True,
                                               "question": question[:160]})
    try:
        outcome = await _answer_group_ai(db, group, question, asker)
    except Exception as e:
        logger.warning(f"Group AI failed: {e}")
        outcome = {"answer": "I could not answer that just now - please try again.",
                   "source": "error", "learned": False}
    finally:
        await _broadcast_group(group["group_id"], {"type": "ai_typing", "typing": False})
    ai_msg = await _store_group_message(
        group,
        {"user_id": "gc_ai", "full_name": "GC AI", "profile_photo": None},
        {"kind": "ai_answer",
         "text": str(outcome.get("answer") or "I could not answer that just now.")[:4000]})
    ai_msg["ai_source"] = outcome.get("source", "")
    ai_msg["ai_learned"] = bool(outcome.get("learned"))
    await _broadcast_group(group["group_id"], {"type": "message", "message": ai_msg})
    return ai_msg


async def _maybe_answer_group_ai(group_id: str, msg: dict, sender: dict):
    try:
        text = (msg.get("text") or "")
        if msg.get("kind") not in ("text", "highlight", "question"):
            return
        if not text.lower().lstrip().startswith("@ai"):
            return
        group = await db.study_groups.find_one({"group_id": group_id}, {"_id": 0})
        if not group:
            return
        await _reply_group_ai(group, msg, sender)
    except Exception as e:
        logger.warning(f"Group AI auto-answer failed: {e}")

'''

anchor = '@api_router.put("/notifications/read-all")'
assert src.count(anchor) == 1, src.count(anchor)
src = src.replace(anchor, ai_helpers + '\n\n' + anchor)
io.open(p, 'w', encoding='utf-8').write(src)
print('INSERTED_AI_HELPERS')
