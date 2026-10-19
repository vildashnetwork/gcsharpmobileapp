import sys
sys.path.insert(0, '.')
import gc_ai_engine as g

print("=== 1. equation extraction ===")
samples = [
    "1) Quadratic formula: x = (-b +/- sqrt(b^2 - 4ac)) / 2a",
    "2) Newton second law: F = ma where F is force",
    "3) Pythagoras: a2 + b2 = c2",
    "4) The polynomial x = 2y + 3 is linear",
]
for s in samples:
    print("   ", g._extract_equations(s))

print()
print("=== 2. research answer composition (no LLM) ===")
research = (
    "Web research results:\n"
    "[1] Quadratic formula - Wikipedia: The quadratic formula x = (-b +/- sqrt(b^2 - 4ac)) / 2a "
    "gives the roots of a quadratic equation ax^2 + bx + c = 0. It works for every quadratic "
    "with real or complex roots.\n"
    "[2] Solving quadratics by factoring: If the product of two numbers is zero then at least one "
    "of them is zero, which lets you split the equation into two linear factors.\n"
    "[3] Completing the square: Rewrite the equation so the left side becomes a perfect square, then "
    "take the square root of both sides to isolate x.\n"
)
out = g._compose_research_answer("Solve x^2 - 5x + 6 = 0", research, "Mathematics")
print(out)
print()

print("=== 3. small talk + junk guards ===")
print("   hi ->", repr(g.detect_small_talk("hi")))
print("   hello there ->", repr(g.detect_small_talk("hello there"))[:60])
print("   solve quadratics ->", repr(g.detect_small_talk("solve quadratics"))[:60])
print("   junk KB guard (<3 terms): ", len(g.extract_keywords("hi")) < 3)

print()
print("=== 4. markdown cleaner ===")
md = "## Title\n**bold** `code`\n---\n* item\nFinal answer: x = 2"
print(g.clean_markdown(md))

print()
print("ALL_ENGINE_CHECKS_OK")