# Miras ML pipeline (Phase 2, experimental)

Nothing here is used by the site. `lab/miras-parts.onnx` is unchanged.

    pip install bpy ultralytics pillow onnxruntime
    python3 ml/synth/gen.py --out DS --n 100 --seed 101 --split test
    python3 ml/synth/gen.py --out DS --n 400 --seed 1   --split train
    # DS/train.yaml: train/val lists (every 10th training render is validation), test: images/test
    python3 ml/train/train.py DS/train.yaml OUT 40
    python3 ml/eval/eval.py --model lab/miras-parts.onnx --data DS/data.yaml --split test --out EVAL_OLD
    python3 ml/eval/eval.py --model OUT/run/weights/best.pt --data DS/data.yaml --split test --out EVAL_NEW

Results of the first run (2026-11-14, synthetic test set only, 100 images): see ml/results-2026-11-14/.
Synthetic metrics do not show real-camera performance. Ultralytics is AGPL-3.0.
