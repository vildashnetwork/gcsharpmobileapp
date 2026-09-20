# __SG_REST__ part 4/5: candidates + leave + patch
@api_router.get("/study-groups/{group_id}/candidates")
async def list_group_candidates(group_id: str, q: Optional[str] = None,
                                user: dict = Depends(get_current_user)):
    g = await db.study_groups.find_one({"group_id": group_id}, {"_id": 0})
    if not g:
        raise HTTPException(404, "Group not found")
    _require_group_admin(g, user["user_id"], user.get("role", ""))
    member_ids = {m.get("user_id") for m in g.get("members") or [] if isinstance(m, dict)}
    query: dict = {"role": {"$ne": "teacher"}, "exam_level": g.get("exam_level")}
    if q and q.strip():
        rx = {"$regex": re.escape(q.strip()), "$options": "i"}
        query["$or"] = [{"full_name": rx}, {"email": rx}]
    docs = await db.users.find(query, {"_id": 0, "password_hash": 0}).to_list(50)
    return {"items": [
        {"user_id": d.get("user_id"), "full_name": d.get("full_name", "Student"),
         "email": d.get("email", ""), "profile_photo": d.get("profile_photo"),
         "exam_level": d.get("exam_level", "")}
        for d in docs if d.get("user_id") not in member_ids][:30]}


@api_router.post("/study-groups/{group_id}/leave")
async def leave_study_group(group_id: str, user: dict = Depends(get_current_user)):
    g = await db.study_groups.find_one({"group_id": group_id}, {"_id": 0})
    if not g:
        raise HTTPException(404, "Group not found")
    member = next((m for m in g.get("members") or []
                   if isinstance(m, dict) and m.get("user_id") == user["user_id"]), None)
    if not member:
        return {"ok": True}
    remaining = [m for m in g.get("members") or []
                 if not (isinstance(m, dict) and m.get("user_id") == user["user_id"])]
    if not remaining:
        await db.study_groups.delete_one({"group_id": group_id})
        await db.study_group_messages.delete_many({"group_id": group_id})
        await db.study_group_requests.delete_many({"group_id": group_id})
        await _broadcast_group(group_id, {"type": "group_deleted", "group_id": group_id})
        return {"ok": True, "deleted": True}
    if member.get("role") == "admin" and not any(
            isinstance(m, dict) and m.get("role") == "admin" for m in remaining):
        remaining[0]["role"] = "admin"
        await db.study_groups.update_one(
            {"group_id": group_id},
            {"$set": {"members": remaining,
                      "updated_at": datetime.utcnow().isoformat()}})
    else:
        await db.study_groups.update_one(
            {"group_id": group_id},
            {"$pull": {"members": {"user_id": user["user_id"]}},
             "$set": {"updated_at": datetime.utcnow().isoformat()}})
    await _broadcast_group(group_id, {"type": "member_left",
                                      "user_id": user["user_id"]})
    return {"ok": True}


@api_router.patch("/study-groups/{group_id}")
async def patch_study_group(group_id: str, inp: StudyGroupPatch,
                            user: dict = Depends(get_current_user)):
    g = await db.study_groups.find_one({"group_id": group_id}, {"_id": 0})
    if not g:
        raise HTTPException(404, "Group not found")
    _require_group_admin(g, user["user_id"], user.get("role", ""))
    patch = {}
    if inp.name is not None and inp.name.strip():
        patch["name"] = inp.name.strip()[:80]
    if inp.description is not None:
        patch["description"] = inp.description[:500]
    if inp.avatar is not None:
        patch["avatar"] = inp.avatar
    if not patch:
        return {"group": _study_group_public(g, user["user_id"])}
    patch["updated_at"] = datetime.utcnow().isoformat()
    await db.study_groups.update_one({"group_id": group_id}, {"$set": patch})
    g = await db.study_groups.find_one({"group_id": group_id}, {"_id": 0})
    await _broadcast_group(group_id, {"type": "group_updated",
                                      "group": _study_group_public(g, None)})
    return {"group": _study_group_public(g, user["user_id"])}
