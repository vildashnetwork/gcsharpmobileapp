# __SG_REST__ part 5a/5: websocket loop
@api_router.websocket("/ws/study-groups/{group_id}")
async def websocket_study_group(websocket: WebSocket, group_id: str,
                                token: Optional[str] = None,
                                user_id: Optional[str] = None):
    user: Optional[dict] = None
    if token:
        try:
            user = await get_current_user(f"Bearer {token}")
        except HTTPException:
            user = None
    if user is None and user_id:
        doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
        if doc:
            doc.pop("password_hash", None)
            user = doc
    if user is None:
        await websocket.close(code=1008)
        return
    group = await db.study_groups.find_one({"group_id": group_id}, {"_id": 0})
    if not group:
        await websocket.close(code=1008)
        return
    try:
        _require_group_member(group, user["user_id"])
    except HTTPException:
        await websocket.close(code=1008)
        return
    room = _group_sockets.setdefault(group_id, {})
    room[user["user_id"]] = websocket
    try:
        await websocket.accept()
    except Exception:
        room.pop(user["user_id"], None)
        return
    await websocket.send_json({
        "type": "ready",
        "group": _study_group_public(group, user["user_id"]),
        "online_count": len(room),
    })
    await _broadcast_group(group_id, {
        "type": "presence", "user_id": user["user_id"],
        "online_count": len(room),
    }, exclude=user["user_id"])
    # PART5B
