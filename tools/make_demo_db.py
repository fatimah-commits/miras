# يولّد قاعدة البيانات التجريبية لمراس: data/demo-db.js
# كل السجلات وهمية (demo: true) ومولّدة ببذرة ثابتة، فالناتج نفسه في كل مرة.  python3 tools/make_demo_db.py
import json, random, datetime
R = random.Random(2026)
NOW = int(datetime.datetime(2026, 11, 14, 9, 0).timestamp() * 1000); D = 86400000
W = {'black_plus': 20, 'red_minus': 15, 'assisted': 8, 'hint': 2, 'unclear': 2, 'quit': 0}   # = WEIGHT in index.html
def score(errs, done):
    s = 100
    for e in errs: s -= W.get(e, 2)
    s = max(0, s); return s if done else min(40, s)

trainers = [
    {'id': '9001', 'pw': '1234', 'name': 'م. سامي السبيعي', 'role': 'trainer'},
    {'id': '9002', 'pw': '1234', 'name': 'م. ريم العتيبي', 'role': 'trainer'},
]
sections = [
    {'id': 'S101', 'name': 'شعبة 101', 'trainerId': '9001', 'term': 'الفصل الأول 1448'},
    {'id': 'S102', 'name': 'شعبة 102', 'trainerId': '9001', 'term': 'الفصل الأول 1448'},
    {'id': 'S201', 'name': 'شعبة 201', 'trainerId': '9002', 'term': 'الفصل الأول 1448'},
]
names = ['نورة القحطاني', 'عبدالله الزهراني', 'لمى الشهري', 'فهد الحارثي', 'شهد المالكي',   # the 5 original demo accounts
         'ريان الغامدي', 'جود العمري', 'سلطان الدوسري', 'رغد السفياني', 'تركي الثبيتي', 'ليان الجهني', 'مازن الشمري',
         'هيا العنزي', 'يزيد المطيري', 'دانة الحربي', 'عمر البقمي', 'أروى الصاعدي', 'خالد الرشيدي', 'رهف الأحمدي',
         'بدر العصيمي', 'غلا الزهراني', 'ناصر القرني', 'وعد الشريف', 'سعود الخثعمي']
trainees = []
for i, n in enumerate(names):
    sec = sections[0 if i < 8 else 1 if i < 16 else 2]['id']
    trainees.append({'id': str(4410201 + i), 'pw': '1234', 'name': n, 'role': 'trainee', 'sectionId': sec})

skill = {'id': 'pwr-led', 'name': 'توصيل تغذية لوحة التجارب من الأردوينو مع فحص القطبية', 'steps': 6,
         'components': ['أردوينو أونو', 'لوحة تجارب', 'سلك أحمر', 'سلك أسود', 'LED', 'مقاومة 220 أوم']}

attempts, sessions = [], []
COACH_MAP = {'red_minus': 'red_in_minus', 'black_plus': 'short'}
for t in trainees:
    skill_level = R.random()                       # 0 = struggles, 1 = strong
    n = R.choice([1, 2, 2, 3, 3, 4])
    day = R.randint(14, 21)
    for k in range(n):
        p_err = max(0.05, 0.55 - 0.4 * skill_level - 0.12 * k)  # fewer mistakes with practice
        errs = []
        if R.random() < p_err: errs.append('red_minus')
        if R.random() < p_err * 0.6: errs.append('black_plus')
        if R.random() < 0.25: errs.append('unclear')
        if R.random() < p_err * 0.5: errs.append('hint')
        done = R.random() > 0.08
        if not done: errs.append('quit')
        mode = R.choice(['camera', 'coach', 'coach', 'coach-test']) if k > 0 else R.choice(['camera', 'coach'])
        at = NOW - day * D + R.randint(8, 13) * 3600000
        dur = 120 + 35 * errs.count('red_minus') + 45 * errs.count('black_plus') + R.randint(0, 90)
        aid = f'demo_{t["id"]}_{k}'
        attempts.append({'id': aid, 'uid': t['id'], 'skillId': skill['id'], 'at': at, 'dur': dur, 'errors': errs,
                         'score': score(errs, done), 'done': done, 'mode': mode, 'demo': True})
        if mode.startswith('coach'):
            ev = [{'type': 'setup', 't': 0}]
            tt = 20
            for e in errs:
                if e in COACH_MAP:
                    ev.append({'type': 'error', 'code': COACH_MAP[e], 't': tt}); tt += 25
                    if R.random() < 0.6: ev.append({'type': 'blocked', 't': tt, 'reasons': [COACH_MAP[e]]}); tt += 10
            ev += [{'type': 'ok', 't': tt, 'code': 'red_ok'}, {'type': 'ok', 't': tt + 20, 'code': 'black_ok'}]
            if R.random() < 0.3: ev.append({'type': 'manual', 'what': 'resistor', 'why': 'camera_unsure', 't': tt + 30})
            sessions.append({'id': aid, 'uid': t['id'], 'mode': 'test' if mode == 'coach-test' else 'train', 'trainee': t['name'],
                             'start': datetime.datetime.fromtimestamp(at / 1000).isoformat(), 'seconds': dur,
                             'attempts': 1 + (1 if mode == 'coach-test' and errs else 0), 'passed': done, 'events': ev, 'demo': True})
        day -= R.randint(2, 5)
        if day < 1: break

db = {'meta': {'demo': True, 'version': 1, 'note': 'بيانات تجريبية مولّدة للعرض فقط. لا تمثل متدربين حقيقيين.',
               'generatedFor': '2026-11-14'},
      'institution': {'id': 'COL1', 'name': 'الكلية التقنية (بيانات تجريبية)'},
      'departments': [{'id': 'MECH', 'institutionId': 'COL1', 'name': 'قسم الميكاترونكس'}],
      'sections': [dict(s, departmentId='MECH') for s in sections],
      'trainers': [dict(t, departmentId='MECH') for t in trainers],
      'trainees': trainees, 'skills': [skill], 'attempts': attempts, 'coachSessions': sessions}
open('data/demo-db.js', 'w').write('/* مولّد بـ tools/make_demo_db.py — بيانات تجريبية فقط */\nwindow.MIRAS_DEMO_DB = ' +
                                   json.dumps(db, ensure_ascii=False, separators=(',', ':')) + ';\n')
print(len(trainees), 'trainees', len(attempts), 'attempts', len(sessions), 'coach sessions')
