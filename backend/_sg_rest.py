# __SG_REST__ part 1/5: list + create
@api_router.get("/study-groups")
async def list_study_groups(user: dict = Depends(get_current_user)):
    mine = await db.study_groups.find(
        {"members.user_id": user["user_id"]}, {"_id": 0}
    ).sort("updated_at", -1).to_list(100)
    level = (user.get("exam_level") or "").strip()
    discover = []
    if level:
        discover = await db.study_groups.find(
            {"exam_level": level, "members.user_id": {"$ne": user["user_id"]}},
            {"_id": 0},
        ).sort("updated_at", -1).to_list(50)
    pending_out, pending_in = [], []
    if user.get("role") != "teacher":
        pending_out = await db.study_group_requests.find(
            {"user_id": user["user_id"], "status": "pending"}, {"_id": 0}
        ).to_list(100)
    else:
        pending_in = await db.study_group_requests.find(
            {"status": "pending"}, {"_id": 0}
        ).sort("created_at", -1).to_list(100)
    return {
        "mine": [_study_group_public(g, user["user_id"]) for g in mine],
        "discover": [_study_group_public(g, user["user_id"]) for g in discover],
        "my_level": level,
        "pending_out": pending_out,
        "pending_in": pending_in,
    }


@api_router.post("/study-groups")
async def create_study_group(inp: StudyGroupIn, user: dict = Depends(get_current_user)):
    if user.get("role") == "teacher":
        raise HTTPException(403, "Study groups are for students")
    name = (inp.name or "").strip()
    if not name:
        raise HTTPException(400, "Group name is required")
    level = (inp.exam_level or user.get("exam_level") or "").strip()
    if not level:
        raise HTTPException(400, "Set your exam level first (Profile > Edit)")
    now = datetime.utcnow().isoformat()
    doc = {
        "group_id": f"sg_{uuid.uuid4().hex[:12]}",
        "name": name[:80],
        "description": (inp.description or "")[:500],
        "exam_level": level,
        "avatar": inp.avatar,
        "created_by": user["user_id"],
        "members": [{
            "user_id": user["user_id"],
            "full_name": user.get("full_name", "Student"),
            "profile_photo": user.get("profile_photo"),
            "role": "admin",
            "status": "member",
            "joined_at": now,
        }],
        "last_message": None,
        "created_at": now,
        "updated_at": now,
    }
    await db.study_groups.insert_one(dict(doc))
    return {"group": _study_group_public(doc, user["user_id"])}

