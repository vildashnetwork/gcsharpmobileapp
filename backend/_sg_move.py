import io
p = 'server_sqlite_full_corrected.py'
lines = io.open(p, encoding='utf-8').read().split('\n')
start = next(i for i, l in enumerate(lines)
             if l.startswith('# Study groups: models + helpers'))
end = next(i for i, l in enumerate(lines)
           if l.startswith('@api_router.put("/notifications/read-all")'))
block = lines[start:end]
rest = lines[:start] + lines[end:]
anchor = '@api_router.get("/study-groups")'
idx = next(i for i, l in enumerate(rest) if l.startswith(anchor))
rest[idx:idx] = block
io.open(p, 'w', encoding='utf-8').write('\n'.join(rest))
import ast
ast.parse('\n'.join(rest))
print('MOVED_OK')
