# Model v2 (2026-11-19)

`lab/miras-parts.onnx` is now v2. The previous live model is kept as `lab/miras-parts-v1.onnx` for a one-line rollback.
Same contract: classes board/led/arduino/resistor/wire, 640 letterbox, NMS output [1,300,6].

Training: YOLO11n from the official yolo11n.pt, 60 epochs on CPU.
Data: 207 Blender renders (`ml/tools/gen_v2.py`: UNO-style board beside the breadboard, 30/63-column boards, more tilts and floors)
+ 148 real public photos and zoomed crops of them (x3). Real test photos were never used in training or validation.

| set | model | mAP50 | Arduino found (conf ≥ 0.6) |
|---|---|---|---|
| 9 real public phone photos (one setup, Nano on board) | v1 | 0.965 | 9/9 |
| same | v2 | 0.992 | 9/9 |
| 80 synthetic renders (seed 101, original generator) | v1 | 0.104 | 0/67 |
| same | v2 (ONNX) | 0.606 | 41/67 |

Limits: no photo of the Miras demo parts from the demo iPad exists yet, so performance on that setup is **not measured**.
The real public test set is small and from the setup the v1 model was trained on. Resistors are still weak on the synthetic set (3/56).
Per-class numbers: the JSON files in this folder.
