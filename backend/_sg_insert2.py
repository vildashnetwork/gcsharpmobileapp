import io
files = ['_sg_rest.py', '_sg_rest2.py', '_sg_rest3.py', '_sg_rest4.py',
         '_sg_rest5.py', '_sg_rest6.py', '_sg_rest7.py']
parts = []
for f in files:
    t = io.open(f, encoding='utf-8').read()
    assert '__SG_REST__' in t, f
    parts.append(t.split('__SG_REST__', 1)[1])
ws_head, ws_tail = parts[5], parts[6]
ws_full = ws_head.replace('    # PART5B', ws_tail)
parts[5] = ws_full
parts.pop(6)
p = 'server_sqlite_full_corrected.py'
src = io.open(p, encoding='utf-8').read()
anchor = '@api_router.get("/notifications")\nasync def get_notifications'
assert src.count(anchor) == 1, src.count(anchor)
block = '\n\n'.join(x.strip('\n') for x in parts)
src = src.replace(anchor, block + '\n\n\n' + anchor)
io.open(p, 'w', encoding='utf-8').write(src)
print('INSERTED_ALL_REST')
