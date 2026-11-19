import sys
from ultralytics import YOLO
data,proj,name,w,ep=sys.argv[1],sys.argv[2],sys.argv[3],sys.argv[4],int(sys.argv[5])
YOLO(w).train(data=data,epochs=ep,imgsz=640,batch=16,device='cpu',workers=4,seed=0,project=proj,name=name,exist_ok=True,plots=False,patience=25,
  hsv_h=0.02,hsv_s=0.6,hsv_v=0.5,degrees=8,translate=0.15,scale=0.6,perspective=0.0005,fliplr=0.5,mosaic=1.0,mixup=0.05,close_mosaic=8,cos_lr=True)
