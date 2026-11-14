"""Train the detector on the synthetic set. Run: python3 ml/train/train.py DS/train.yaml OUTDIR [epochs]
Starts from the official yolo11n.pt (Ultralytics GitHub release). Validation images are a held-out tenth of the
training renders; the test split is never seen here."""
import sys
from ultralytics import YOLO
YOLO('yolo11n.pt').train(data=sys.argv[1],epochs=int(sys.argv[3]) if len(sys.argv)>3 else 40,imgsz=640,batch=16,device='cpu',workers=4,seed=0,project=sys.argv[2],name='run',exist_ok=True,plots=False,
    hsv_h=0.02,hsv_s=0.6,hsv_v=0.5,degrees=10,scale=0.5,fliplr=0.5,mosaic=1.0,close_mosaic=5)
