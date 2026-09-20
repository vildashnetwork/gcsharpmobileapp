import io
p = 'server_sqlite_full_corrected.py'
lines = io.open(p, encoding='utf-8').read().split('\n')
out = []
for n, l in enumerate(lines, start=1):
    s = l.strip()
    if s.startswith('part ') and '/5:' in s:
        print('DROPPED', n, repr(l[:60]))
        continue
    out.append(l)
io.open(p, 'w', encoding='utf-8').write('\n'.join(out))
import ast
ast.parse('\n'.join(out))
print('SYNTAX_OK5')
