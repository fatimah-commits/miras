#!/usr/bin/env python3
"""يقطّع تسجيل الجمل (بالترتيب، مع سكوت بينها) إلى app/voice/<key>.mp3 ويكتب manifest.json.
الترتيب والمفاتيح من app/core/phrases.js. يمكن تمرير أكثر من ملف (تُضم بالترتيب).
الاستخدام: python3 tools/split_app_voice.py <rec1> [rec2 ...] --out app/voice --first 1"""
import sys, subprocess, re, json, os
args = sys.argv[1:]; out = 'app/voice'; first = 1
if '--out' in args: i = args.index('--out'); out = args[i+1]; del args[i:i+2]
if '--first' in args: i = args.index('--first'); first = int(args[i+1]); del args[i:i+2]
here = os.path.dirname(os.path.abspath(__file__))
ALL = re.findall(r"\['([a-z_0-9]+)',", open(os.path.join(here, '..', 'app', 'core', 'phrases.js'), encoding='utf8').read())
src = args[0]
if len(args) > 1:   # ضم الملفات بفاصل سكوت
    src = '/tmp/miras-voice-joined.wav'
    filt = ''.join(f'[{i}:a]aresample=24000,aformat=channel_layouts=mono[a{i}];' for i in range(len(args)))
    subprocess.run(['ffmpeg','-y','-v','error',*sum([['-i',a] for a in args],[]),'-filter_complex',
                    filt + ''.join(f'[a{i}]' for i in range(len(args))) + f'concat=n={len(args)}:v=0:a=1[o]','-map','[o]',src], check=True)
expected = int(os.environ.get('N', '0')) or None
KEYS = ALL[first-1:]
N = expected or len(KEYS)
KEYS = KEYS[:N]
dur = float(subprocess.run(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',src],capture_output=True,text=True).stdout)
def segs(db, d):
    e = subprocess.run(['ffmpeg','-hide_banner','-i',src,'-af',f'silencedetect=noise={db}dB:d={d}','-f','null','-'],capture_output=True,text=True).stderr
    st = [float(x) for x in re.findall(r'silence_start: ([\d.]+)', e)]; en = [float(x) for x in re.findall(r'silence_end: ([\d.]+)', e)]
    cuts = []; t = 0.0
    for a, b in zip(st, en + [dur]):
        if a - t > 0.35: cuts.append((max(0, t - 0.12), a + 0.12))
        t = b
    if dur - t > 0.35: cuts.append((max(0, t - 0.12), dur))
    return cuts
best = None
for d in (1.2, 1.0, 0.8, 1.5, 0.7, 0.6, 2.0, 0.5):
    for db in (-35, -30, -40, -28, -45, -25, -50):
        c = segs(db, d)
        if best is None or abs(len(c) - N) < abs(len(best[2]) - N): best = (db, d, c)
        if len(c) == N: break
    if len(best[2]) == N: break
db, d, c = best
print(f'segments={len(c)} expected={N} (noise={db}dB pause>={d}s)')
for i, (a, b) in enumerate(c): print(i + 1, f'{a:.1f}-{b:.1f}s ({b-a:.1f}s)', KEYS[i] if i < N else '?')
if len(c) != N: print('count mismatch: not writing files'); sys.exit(2)
os.makedirs(out, exist_ok=True); man = {}
for k, (a, b) in zip(KEYS, c):
    f = f'{k}.mp3'
    subprocess.run(['ffmpeg','-y','-v','error','-i',src,'-ss',f'{a:.2f}','-to',f'{b:.2f}','-ac','1','-ar','24000',
                    '-af','highpass=f=80,afftdn=nf=-25,loudnorm=I=-16:TP=-1.5','-b:a','64k',os.path.join(out,f)],check=True)
    man[k] = f
mp = os.path.join(out,'manifest.json')
old = json.load(open(mp)) if os.path.exists(mp) else {}
old.update(man)
json.dump(old, open(mp,'w'), indent=1)
print('ok', len(man))
