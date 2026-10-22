# Drainage Studio validation (node test.js)

Sources: FHWA HEC-22 4th ed. (2024) Examples 5.1-5.3, 6.1, 7.1-7.8; TxDOT HDM Ch. 10 Sec. 6 Eq. 10-4/10-5..10-13 (consistency checks). INFO rows = book rounding/arithmetic differences, explained.

Status | Check | Computed | HEC-22 | Tol / note
---|---|---|---|---
PASS | Ex5.1A T @Q1.8 | 9.030 | 9 | ±0.1
PASS | Ex5.1B Q @T8.2 | 1.402 | 1.4 | ±0.05
PASS | Ex5.2A Eo @T8.2 | 0.711 | 0.7 | ±0.015
PASS | Ex5.2A Qs | 0.664 | 0.66 | ±0.02
PASS | Ex5.2A Q | 2.300 | 2.3 | ±0.1
PASS | Ex5.2B T @Q4.2 | 11.089 | 11.1 | ±0.1
PASS | Ex5.3 V-gutter T @Q1.77 | 8.319 | 8.3 | ±0.1
PASS | TxDOT Eq10-4 vs HEC Eq5.4 T | 8.965 | 9.029872911527647 | ±0.1
PASS | Ex6.1 A | 11.840 | 11.8 | ±0.05
PASS | Ex6.1 P | 12.719 | 12.7 | ±0.05
PASS | Ex6.1 Q | 55.912 | 55.7 | ±0.6
PASS | Ex6.1 V | 4.722 | 4.7 | ±0.05
PASS | Ex6.1 normal depth @55.7 | 1.597 | 1.6 | ±0.01
PASS | Ex7.1 Q | 6.621 | 6.62 | ±0.03
PASS | Ex7.1 Eo | 0.454 | 0.45 | ±0.01
PASS | Ex7.1 V | 5.432 | 5.4 | ±0.05
PASS | Ex7.1 P-1-7/8 2x2 Rf | 1.000 | 1 | ±0.01
PASS | Ex7.1 P-1-7/8 2x2 Rs | 0.038 | 0.038 | ±0.002
PASS | Ex7.1 P-1-7/8 2x2 Qi | 3.140 | 3.15 | ±0.03
PASS | Ex7.1 Reticuline 2x2 Rf | 0.877 | 0.88 | ±0.01
PASS | Ex7.1 Reticuline 2x2 Rs | 0.038 | 0.038 | ±0.002
PASS | Ex7.1 Reticuline 2x2 Qi | 2.772 | 2.8 | ±0.03
PASS | Ex7.1 P-1-7/8 2x4 Rf | 1.000 | 1 | ±0.01
PASS | Ex7.1 P-1-7/8 2x4 Rs | 0.161 | 0.163 | ±0.002
PASS | Ex7.1 P-1-7/8 2x4 Qi | 3.588 | 3.6 | ±0.03
PASS | Ex7.1 Reticuline 2x4 Rf | 1.000 | 1 | ±0.01
PASS | Ex7.1 Reticuline 2x4 Rs | 0.161 | 0.163 | ±0.002
PASS | Ex7.1 Reticuline 2x4 Qi | 3.588 | 3.6 | ±0.03
PASS | Ex7.2 undepr LT | 23.945 | 23.9 | ±0.2
PASS | Ex7.2 undepr E | 0.614 | 0.61 | ±0.01
PASS | Ex7.2 undepr Qi | 1.087 | 1.08 | ±0.02
PASS | Ex7.2 depr Eo | 0.638 | 0.64 | ±0.01
PASS | Ex7.2 depr Se | 0.047 | 0.047 | ±0.001
PASS | Ex7.2 depr LT | 14.417 | 14.3 | ±0.15
PASS | Ex7.2 depr E | 0.873 | 0.88 | ±0.01
PASS | Ex7.2 depr Qi | 1.546 | 1.56 | ±0.03
PASS | Ex7.3 LT (Eo 0.70 given) | 11.696 | 11.7 | ±0.1
PASS | Ex7.3 Eo from Q2.26 (5.2A gives 0.70) | 0.716 | 0.7 | ±0.02
PASS | Ex7.3 LT computed | 11.579 | 11.7 | ±0.15
PASS | Ex7.4 curb part Qic | 1.339 | 1.35 | ±0.02
INFO | Ex7.4 grate Eo | 0.946 | 0.97 | book iterates on Qs rounded to 0.01 cfs
INFO | Ex7.4 grate T | 3.761 | 3.2 | same
INFO | Ex7.4 grate V | 1.917 | 2.27 | follows T
INFO | Ex7.4 grate Rs | 0.169 | 0.13 | follows V
PASS | Ex7.4 grate Qig | 0.412 | 0.41 | ±0.01
PASS | Ex7.4 total Qi | 1.751 | 1.76 | ±0.02
PASS | Ex7.5 req P @d0.442 (unrounded) | 7.690 | 7.66 | ±0.05
PASS | Ex7.5 double 2x3, 50% clog P | 8.000 | 8 | ±1e-9
PASS | Ex7.5 weir d | 0.431 | 0.43 | ±0.005
INFO | Ex7.5 req Ag @d0.44 | 1.881 | 2.15 | book arithmetic: 6.71/(0.67*sqrt(64.4*0.44)) = 1.88
PASS | Ex7.5 orifice check d (Ag 3.0) | 0.173 | 0.17 | ±0.005
PASS | Ex7.6 undepressed Qi | 1.617 | 1.6 | ±0.05
INFO | Ex7.6 depressed Qi (d=0.16) | 1.758 | 1.7 | 0.29*8.025*11.8*0.16^1.5 = 1.76; book shows 1.7
PASS | Ex7.6 depressed di | 0.243 | 0.25 | ±0.01
PASS | Ex7.6 depressed regime weir | 1.000 | 1 | ±0
PASS | Ex7.7 weir L | 11.987 | 12 | ±0.1
PASS | Ex7.7 orifice L | 9.555 | 9.6 | ±0.1
PASS | Ex7.8 grate weir davg (Cw 0.37 vs 3.0) | 0.368 | 0.36 | ±0.01
PASS | Ex7.8 curb depth | 0.398 | 0.39 | ±0.01
PASS | Ex7.8 T clear | 13.262 | 13 | ±0.3
PASS | Ex7.8 clogged do | 0.575 | 0.576 | ±0.005
PASS | Ex7.8 clogged di | 0.737 | 0.74 | ±0.005
PASS | Ex7.8 clogged T | 24.582 | 24.7 | ±0.2
PASS | TxDOT undepr LT = HEC LT | 23.945 | 23.94473501439479 | ±0.05
PASS | TxDOT Eo (Eq10-5) in [0,1] | 1.000 | 1 | ±0

59 pass, 0 fail
