# __SG_REST__ part 5b/5: ws events + peers
    try:
        while True:
            data = await websocket.receive_json()
            etype = str(data.get("type") or "").strip().lower()
            if etype == "ping":
                await websocket.send_json({"type": "pong"})
            elif etype == "typing":
                await _broadcast_group(group_id, {
                    "type": "typing", "user_id": user["user_id"],
                    "full_name": user.get("full_name", "Student"),
                    "typing": bool(data.get("typing", True)),
                }, exclude=user["user_id"])
            elif etype in ("send", "ask_ai"):
                try:
                    fresh = await db.study_groups.find_one(
                        {"group_id": group_id}, {"_id": 0})
                    if not fresh:
                        await websocket.send_json({"type": "error",
                                                   "message": "Group no longer exists"})
                        continue
                    _require_group_member(fresh, user["user_id"])
                    if etype == "ask_ai":
                        question = str(data.get("question") or data.get("text") or "").strip()
                        if not question:
                            await websocket.send_json({"type": "error",
                                                       "message": "Question is required"})
                            continue
                        qmsg = await _store_group_message(
                            fresh, user, {"kind": "text", "text": question})
                        await _broadcast_group(group_id, {"type": "message",
                                                          "message": qmsg})
                        asyncio.create_task(_reply_group_ai(fresh, qmsg, dict(user)))
                    else:
                        msg = await _store_group_message(fresh, user, data)
                        await _broadcast_group(group_id, {"type": "message",
                                                          "message": msg})
                        asyncio.create_task(
                            _maybe_answer_group_ai(group_id, msg, dict(user)))
                except HTTPException as e:
                    await websocket.send_json({"type": "error",
                                               "message": e.detail})
                except Exception as e:
                    logger.warning(f"Group WS event failed: {e}")
                    await websocket.send_json({"type": "error",
                                               "message": "Could not send message"})
            else:
                await websocket.send_json({"type": "error",
                                           "message": "Unknown event"})
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.warning(f"Group WS error: {e}")
    finally:
        room.pop(user["user_id"], None)
        if not room:
            _group_sockets.pop(group_id, None)


@api_router.get("/users/peers")
async def list_peer_students(q: Optional[str] = None, limit: int = 30,
                             user: dict = Depends(get_current_user)):
    query: dict = {"role": {"$ne": "teacher"}}
    if user.get("role") != "teacher" and user.get("exam_level"):
        query["exam_level"] = user["exam_level"]
    if q and q.strip():
        rx = {"$regex": re.escape(q.strip()), "$options": "i"}
        query["$or"] = [{"full_name": rx}, {"email": rx}]
    docs = await db.users.find(query, {"_id": 0, "password_hash": 0}).to_list(
        min(max(limit, 1), 50))
    return {"items": [
        {"user_id": d.get("user_id"), "full_name": d.get("full_name", "Student"),
         "email": d.get("email", ""), "profile_photo": d.get("profile_photo"),
         "exam_level": d.get("exam_level", "")}
        for d in docs if d.get("user_id") != user["user_id"]][:30]}
