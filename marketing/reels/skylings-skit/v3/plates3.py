"""Skit v3 plates (Fable's cut): the extra shots, made with skit_plates.py's decode, grade and macro focus.
  open_line   clip 6, 1.58 .. 3.86   the five on the rim from low and close while Tyler asks (same moment as the next shot, so the fire matches)
  m_ray2      clip 11, 13.6 .. 19.6  Ray's close-up in front of the biggest flames, 6 s
  just_line   clip 10, 4.4 .. 10.0   the line-up for "Just?" and "Pick one of us."
  a_react     clip 8, 6.45 .. 7.65   Ali's silent smile
"""
import sys, os
HERE = os.path.dirname(os.path.abspath(__file__)); SP = os.path.dirname(HERE)
sys.path.insert(0, f"{SP}/skit"); _a = sys.argv; sys.argv = sys.argv[:1]
import skit_plates as S
sys.argv = _a
F = S.F
LINE = dict(z=2.4, cx=1000, cy=2524)                                   # 900 x 1600 source px; the rim's front at 62% of the frame
S.PLATES = {
    "open_line": (6, 1.58, 3.86, [(0, dict(LINE)), (2.28, dict(LINE, z=2.5))], 2716),
    "m_ray2": (11, 13.6, 19.6, [(0, S.macro(1180, 2590)), (6.0, S.macro(1185, 2590, 4.25))], 2712),
    "just_line": (10, 4.4, 10.0, [(0, dict(LINE, z=2.5)), (5.6, dict(LINE, z=2.62))], 2716),
    "a_react": (8, 6.45, 7.65, [(0, S.sh(S.AL, z=2.6)), (1.2, S.sh(S.AL, z=2.66))], None),
}
S.HERE = HERE
if __name__ == "__main__":
    os.makedirs(f"{HERE}/plates", exist_ok=True)
    for nm in (sys.argv[1:] or list(S.PLATES)): S.render(nm)
