"""Replace training section with clean new design"""

NEW_TRAINING = """  <!-- ========== SECTION 5: TRAINING PLAN ========== -->
  <section id="training" class="section-tab">
    <div class="section-title">תוכנית אימונים</div>

    <!-- Zone bar -->
    <div class="zone-legend-bar glass-card">
      <span class="zone-legend-title">זונות דופק</span>
      <div class="zone-legend-items">
        <div class="zl-item z2"><b>Z2</b><span>109–126</span><small>קל</small></div>
        <div class="zl-item z3"><b>Z3</b><span>127–145</span><small>טמפו</small></div>
        <div class="zl-item z4"><b>Z4</b><span>146–163</span><small>סף</small></div>
        <div class="zl-item z5"><b>Z5</b><span>164+</span><small>ספרינט</small></div>
      </div>
    </div>

    <!-- Plan tabs -->
    <div class="training-tabs">
      <button class="training-tab-btn active" data-tab="archive">ארכיון — 3 חודשים</button>
      <button class="training-tab-btn" data-tab="levelup">Level Up ⚡</button>
    </div>

    <!-- ARCHIVE -->
    <div class="training-panel active" id="tab-archive">
      <div class="plan-label">אימוני טמפו</div>
      <div class="workout-list">

        <div class="wc glass-card">
          <div class="wc-head">
            <span class="wc-num">01</span>
            <div class="wc-titles"><div class="wc-name">אימון טמפו 1</div><div class="wc-sub">3 סטים × 20 דק׳ · ללא מנוחה · 60 דק׳ רציף</div></div>
            <span class="wc-badge tempo">טמפו</span>
          </div>
          <div class="wc-bar">
            <div class="wb z2" style="flex:15">Z2<br><small>15׳</small></div>
            <div class="wb z3" style="flex:10">Z3<br><small>10׳</small></div>
            <div class="wb z4" style="flex:10">Z4<br><small>10׳</small></div>
            <div class="wb z3" style="flex:10">Z3<br><small>10׳</small></div>
            <div class="wb z4" style="flex:10">Z4<br><small>10׳</small></div>
            <div class="wb z3" style="flex:10">Z3<br><small>10׳</small></div>
            <div class="wb z4" style="flex:10">Z4<br><small>10׳</small></div>
          </div>
          <div class="wc-desc">חימום 15 דק׳ (10׳ Z2 + 5׳ Z3) · 3 סטים: <b>10 דק׳ Z3</b> (135–138) + <b>10 דק׳ Z4</b> (150–155) ללא מנוחה בין חלקים</div>
        </div>

        <div class="wc glass-card">
          <div class="wc-head">
            <span class="wc-num">02</span>
            <div class="wc-titles"><div class="wc-name">אימון טמפו 2</div><div class="wc-sub">4 סטים + סיומת · ~60 דק׳</div></div>
            <span class="wc-badge tempo">טמפו</span>
          </div>
          <div class="wc-bar">
            <div class="wb z3" style="flex:6">Z3<br><small>6׳</small></div>
            <div class="wb z4" style="flex:4">Z4<br><small>4׳</small></div>
            <div class="wb z2" style="flex:2">Z2<br><small>2׳</small></div>
            <div class="wb z3" style="flex:6">Z3<br><small>×3</small></div>
            <div class="wb z4" style="flex:4">Z4<br><small>×3</small></div>
            <div class="wb z2" style="flex:2">Z2<br><small>×3</small></div>
            <div class="wb z3" style="flex:12">Z3 סיומת<br><small>12׳</small></div>
          </div>
          <div class="wc-desc">4 סטים: <b>6 דק׳ Z3</b> (135–140) + <b>4 דק׳ Z4</b> (146–155) + <b>2 דק׳ Z2</b> התאוששות · לאחר 4 סטים: 12 דק׳ Z3 יציב (130–140)</div>
        </div>

        <div class="wc glass-card">
          <div class="wc-head">
            <span class="wc-num">03</span>
            <div class="wc-titles"><div class="wc-name">אימון טמפו 3</div><div class="wc-sub">3 בלוקים × 20 דק׳ · 60 דק׳</div></div>
            <span class="wc-badge tempo">טמפו</span>
          </div>
          <div class="wc-bar">
            <div class="wb z3" style="flex:12">Z3<br><small>12׳</small></div>
            <div class="wb z4" style="flex:8">Z4<br><small>8׳</small></div>
            <div class="wb z3" style="flex:12">Z3<br><small>12׳</small></div>
            <div class="wb z4" style="flex:8">Z4<br><small>8׳</small></div>
            <div class="wb z3-h" style="flex:10">Z3+<br><small>10׳</small></div>
            <div class="wb z3" style="flex:10">Z3<br><small>10׳</small></div>
          </div>
          <div class="wc-desc">בלוקים 1–2: <b>12 דק׳ Z3</b> (135–140) + <b>8 דק׳ Z4</b> (150–158) · בלוק 3: <b>10 דק׳ Z3 גבוה</b> (140–145) + <b>10 דק׳ Z3</b> (132–138)</div>
        </div>

        <div class="wc glass-card">
          <div class="wc-head">
            <span class="wc-num">04</span>
            <div class="wc-titles"><div class="wc-name">אימון טמפו 4</div><div class="wc-sub">4 בלוקים × 15 דק׳ · 60 דק׳</div></div>
            <span class="wc-badge tempo">טמפו</span>
          </div>
          <div class="wc-bar">
            <div class="wb z3" style="flex:10">Z3<br><small>10׳</small></div>
            <div class="wb z4" style="flex:5">Z4<br><small>5׳</small></div>
            <div class="wb z3" style="flex:10">Z3<br><small>10׳</small></div>
            <div class="wb z4" style="flex:5">Z4<br><small>5׳</small></div>
            <div class="wb z3" style="flex:10">Z3<br><small>10׳</small></div>
            <div class="wb z4" style="flex:5">Z4<br><small>5׳</small></div>
            <div class="wb z3" style="flex:15">Z3 יציב<br><small>15׳</small></div>
          </div>
          <div class="wc-desc">בלוקים 1–3: <b>10 דק׳ Z3</b> (135–140) + <b>5 דק׳ Z4</b> (150–158) · בלוק 4: <b>15 דק׳ Z3</b> יציב (135–140)</div>
        </div>

      </div>

      <div class="plan-label" style="margin-top:2.5rem">אימוני ספרינטים</div>
      <div class="workout-list">

        <div class="wc glass-card">
          <div class="wc-head">
            <span class="wc-num">01</span>
            <div class="wc-titles"><div class="wc-name">אימון ספרינט 1</div><div class="wc-sub">2 בלוקים × 8 חזרות · 20 שנ׳</div></div>
            <span class="wc-badge sprints">ספרינטים</span>
          </div>
          <div class="wc-bar">
            <div class="wb z5" style="flex:8">8×20″<br><small>Z5</small></div>
            <div class="wb z3" style="flex:10">10 דק׳<br><small>Z3</small></div>
            <div class="wb z5" style="flex:8">8×20″<br><small>Z5</small></div>
          </div>
          <div class="wc-desc">2 בלוקים × 8 חזרות: <b>20 שנ׳ Z5</b> / <b>1:40 דק׳ Z2</b> מנוחה · בין הבלוקים: 10 דק׳ Z3 (135–140)</div>
        </div>

        <div class="wc glass-card">
          <div class="wc-head">
            <span class="wc-num">02</span>
            <div class="wc-titles"><div class="wc-name">אימון ספרינט 2</div><div class="wc-sub">2 בלוקים × 8 חזרות · 25 שנ׳</div></div>
            <span class="wc-badge sprints">ספרינטים</span>
          </div>
          <div class="wc-bar">
            <div class="wb z5" style="flex:8">8×25″<br><small>Z5</small></div>
            <div class="wb z3" style="flex:10">10 דק׳<br><small>Z3</small></div>
            <div class="wb z5" style="flex:8">8×25″<br><small>Z5</small></div>
          </div>
          <div class="wc-desc">2 בלוקים × 8 חזרות: <b>25 שנ׳ Z5</b> / <b>1:35 דק׳ Z2</b> מנוחה · בין הבלוקים: 10 דק׳ Z3</div>
        </div>

        <div class="wc glass-card">
          <div class="wc-head">
            <span class="wc-num">03</span>
            <div class="wc-titles"><div class="wc-name">אימון ספרינט 3</div><div class="wc-sub">2 בלוקים × 8 חזרות · 30 שנ׳</div></div>
            <span class="wc-badge sprints">ספרינטים</span>
          </div>
          <div class="wc-bar">
            <div class="wb z5" style="flex:8">8×30″<br><small>Z5</small></div>
            <div class="wb z3" style="flex:10">10 דק׳<br><small>Z3</small></div>
            <div class="wb z5" style="flex:8">8×30″<br><small>Z5</small></div>
          </div>
          <div class="wc-desc">2 בלוקים × 8 חזרות: <b>30 שנ׳ Z5</b> / <b>1:30 דק׳ Z2</b> מנוחה · בין הבלוקים: 10 דק׳ Z3</div>
        </div>

        <div class="wc glass-card">
          <div class="wc-head">
            <span class="wc-num">04</span>
            <div class="wc-titles"><div class="wc-name">אימון ספרינט 4</div><div class="wc-sub">2 בלוקים — Z4 ואחר כך 100מ׳ Z5</div></div>
            <span class="wc-badge sprints">ספרינטים</span>
          </div>
          <div class="wc-bar">
            <div class="wb z4" style="flex:8">8×40″<br><small>Z4</small></div>
            <div class="wb z5" style="flex:8">8×100מ׳<br><small>Z5</small></div>
          </div>
          <div class="wc-desc">בלוק 1: 8 סטים × <b>40 שנ׳ Z4</b> / 30 שנ׳ Z2 · בלוק 2: 8 חזרות × <b>100 מטר Z5</b> / 2:30 דק׳ מנוחה מלאה</div>
        </div>

      </div>
    </div><!-- /tab-archive -->

    <!-- LEVEL UP -->
    <div class="training-panel" id="tab-levelup">
      <div class="plan-label">אימוני טמפו — Level Up</div>
      <div class="workout-list">

        <div class="wc glass-card">
          <div class="wc-head">
            <span class="wc-num">01</span>
            <div class="wc-titles"><div class="wc-name">מדרגות סף</div><div class="wc-sub">3 סטים עולים + חימום · ~75 דק׳</div></div>
            <span class="wc-badge tempo">טמפו</span>
          </div>
          <div class="wc-bar">
            <div class="wb z2" style="flex:15">חימום<br><small>15׳</small></div>
            <div class="wb z3" style="flex:7">Z3<br><small>7׳</small></div>
            <div class="wb z4" style="flex:7">Z4<br><small>7׳</small></div>
            <div class="wb z4-h" style="flex:6">Z4+<br><small>6׳</small></div>
            <div class="wb z2" style="flex:2">מנוחה<br><small>2׳</small></div>
            <div class="wb z3" style="flex:7">Z3<br><small>7׳</small></div>
            <div class="wb z4" style="flex:7">Z4<br><small>7׳</small></div>
            <div class="wb z4-h" style="flex:6">Z4+<br><small>6׳</small></div>
            <div class="wb z2" style="flex:2">מנוחה<br><small>2׳</small></div>
            <div class="wb z3" style="flex:7">Z3<br><small>7׳</small></div>
            <div class="wb z4" style="flex:7">Z4<br><small>7׳</small></div>
            <div class="wb z4-h" style="flex:6">Z4+<br><small>6׳</small></div>
          </div>
          <div class="wc-desc">חימום 15 דק׳ · 3 סטים + 2 דק׳ Z2 מנוחה: <b>7׳ Z3</b> (135–138) → <b>7׳ Z4 נמוך</b> (146–152) → <b>6׳ Z4 גבוה</b> (158–162)</div>
        </div>

        <div class="wc glass-card">
          <div class="wc-head">
            <span class="wc-num">02</span>
            <div class="wc-titles"><div class="wc-name">פירמידה הפוכה</div><div class="wc-sub">4 סטים + סיומת שינויי קצב · ~58 דק׳</div></div>
            <span class="wc-badge tempo">טמפו</span>
          </div>
          <div class="wc-bar">
            <div class="wb z3" style="flex:5">Z3<br><small>5׳</small></div>
            <div class="wb z4" style="flex:3">Z4<br><small>3׳</small></div>
            <div class="wb z4-h" style="flex:2">Z4+<br><small>2׳</small></div>
            <div class="wb z2" style="flex:2">Z2<br><small>2׳</small></div>
            <div class="wb z3" style="flex:5">Z3<br><small>5׳</small></div>
            <div class="wb z4" style="flex:3">Z4<br><small>3׳</small></div>
            <div class="wb z4-h" style="flex:2">Z4+<br><small>2׳</small></div>
            <div class="wb z2" style="flex:2">Z2<br><small>2׳</small></div>
            <div class="wb z3" style="flex:5">Z3<br><small>5׳</small></div>
            <div class="wb z4" style="flex:3">Z4<br><small>3׳</small></div>
            <div class="wb z4-h" style="flex:2">Z4+<br><small>2׳</small></div>
            <div class="wb z2" style="flex:2">Z2<br><small>2׳</small></div>
            <div class="wb z3" style="flex:5">Z3<br><small>5׳</small></div>
            <div class="wb z4" style="flex:3">Z4<br><small>3׳</small></div>
            <div class="wb z4-h" style="flex:2">Z4+<br><small>2׳</small></div>
            <div class="wb z2" style="flex:2">Z2<br><small>2׳</small></div>
            <div class="wb z4" style="flex:5">Z4<br><small>5׳</small></div>
            <div class="wb z3" style="flex:5">Z3<br><small>5׳</small></div>
          </div>
          <div class="wc-desc">4 סטים + 2 דק׳ Z2: <b>5׳ Z3</b> (138–142) → <b>3׳ Z4</b> (152–157) → <b>2׳ Z4+</b> (160–163) · סיומת: 10 דק׳ שינויי קצב Z4/Z3</div>
        </div>

        <div class="wc glass-card">
          <div class="wc-head">
            <span class="wc-num">03</span>
            <div class="wc-titles"><div class="wc-name">Over-Under</div><div class="wc-sub">3 בלוקים × 20 דק׳ · 60 דק׳</div></div>
            <span class="wc-badge tempo">טמפו</span>
          </div>
          <div class="wc-bar">
            <div class="wb z4" style="flex:3">Z4<br><small>3׳</small></div>
            <div class="wb z3-h" style="flex:2">Z3+<br><small>2׳</small></div>
            <div class="wb z4" style="flex:3">Z4<br><small>3׳</small></div>
            <div class="wb z3-h" style="flex:2">Z3+<br><small>2׳</small></div>
            <div class="wb z4" style="flex:3">Z4<br><small>3׳</small></div>
            <div class="wb z3-h" style="flex:2">Z3+<br><small>2׳</small></div>
            <div class="wb z4" style="flex:3">Z4<br><small>3׳</small></div>
            <div class="wb z3-h" style="flex:2">Z3+<br><small>2׳</small></div>
            <div class="wb z4" style="flex:3">Z4<br><small>3׳</small></div>
            <div class="wb z3-h" style="flex:2">Z3+<br><small>2׳</small></div>
            <div class="wb z4" style="flex:3">Z4<br><small>3׳</small></div>
            <div class="wb z3-h" style="flex:2">Z3+<br><small>2׳</small></div>
            <div class="wb z4" style="flex:3">Z4<br><small>3׳</small></div>
            <div class="wb z3-h" style="flex:2">Z3+<br><small>2׳</small></div>
            <div class="wb z4" style="flex:3">Z4<br><small>3׳</small></div>
            <div class="wb z3-h" style="flex:2">Z3+<br><small>2׳</small></div>
            <div class="wb z4" style="flex:15">Z4 נמוך<br><small>15׳</small></div>
            <div class="wb z4-h" style="flex:5">Z4+ SPM<br><small>5׳</small></div>
          </div>
          <div class="wc-desc">בלוקים 1–2 × 20 דק׳: 4 סבבים × (<b>3׳ Z4</b> 150–155 + <b>2׳ Z3+</b> 140–144) · בלוק 3: <b>15׳ Z4 נמוך</b> + <b>5׳ Z4+ SPM מהיר</b></div>
        </div>

        <div class="wc glass-card">
          <div class="wc-head">
            <span class="wc-num">04</span>
            <div class="wc-titles"><div class="wc-name">עומס מצטבר</div><div class="wc-sub">4 בלוקים — עצימות עולה · 60 דק׳</div></div>
            <span class="wc-badge tempo">טמפו</span>
          </div>
          <div class="wc-bar">
            <div class="wb z3" style="flex:15">Z3<br><small>15׳</small></div>
            <div class="wb z4" style="flex:10">Z4<br><small>10׳</small></div>
            <div class="wb z3-h" style="flex:5">Z3+<br><small>5׳</small></div>
            <div class="wb z4" style="flex:5">Z4<br><small>5׳</small></div>
            <div class="wb z4-h" style="flex:5">Z4+<br><small>5׳</small></div>
            <div class="wb z3" style="flex:5">Z3<br><small>5׳</small></div>
            <div class="wb z4-h" style="flex:10">Z4+<br><small>10׳</small></div>
            <div class="wb z5" style="flex:5">Z5<br><small>5׳</small></div>
          </div>
          <div class="wc-desc">ב1: <b>15׳ Z3</b> · ב2: <b>10׳ Z4</b> + <b>5׳ Z3+</b> · ב3: <b>5׳ Z4 + 5׳ Z4+ + 5׳ Z3</b> · ב4: <b>10׳ Z4+</b> + <b>5׳ All-Out Z5</b></div>
        </div>

      </div>

      <div class="plan-label" style="margin-top:2.5rem">אימוני ספרינטים — Level Up</div>
      <div class="workout-list">

        <div class="wc glass-card">
          <div class="wc-head">
            <span class="wc-num">01</span>
            <div class="wc-titles"><div class="wc-name">קיצור מנוחות</div><div class="wc-sub">2 בלוקים × 10 חזרות · 20 שנ׳</div></div>
            <span class="wc-badge sprints">ספרינטים</span>
          </div>
          <div class="wc-bar">
            <div class="wb z5" style="flex:10">10×20″<br><small>Z5</small></div>
            <div class="wb z3" style="flex:8">8 דק׳<br><small>Z3</small></div>
            <div class="wb z5" style="flex:10">10×20″<br><small>Z5</small></div>
          </div>
          <div class="wc-desc">2 בלוקים × 10 חזרות: <b>20 שנ׳ Z5</b> / <b>1:10 דק׳ Z2</b> מנוחה · בין הבלוקים: 8 דק׳ Z3 רציף</div>
        </div>

        <div class="wc glass-card">
          <div class="wc-head">
            <span class="wc-num">02</span>
            <div class="wc-titles"><div class="wc-name">ספרינטים מלוכלכים</div><div class="wc-sub">12 חזרות + סיומת כוח מתפרץ</div></div>
            <span class="wc-badge sprints">ספרינטים</span>
          </div>
          <div class="wc-bar">
            <div class="wb z5" style="flex:12">12×30″<br><small>Z5 + Z3+ מנוחה</small></div>
            <div class="wb z5" style="flex:4">4×15″<br><small>כוח</small></div>
          </div>
          <div class="wc-desc">12 חזרות: <b>30 שנ׳ Z5</b> / <b>1 דק׳ Z3+</b> (140–145) · סיומת: 4 × <b>15 שנ׳ יציאה מהמקום</b> + 2 דק׳ מנוחה מלאה</div>
        </div>

        <div class="wc glass-card">
          <div class="wc-head">
            <span class="wc-num">03</span>
            <div class="wc-titles"><div class="wc-name">פירמידה מתקצרת</div><div class="wc-sub">בלוק Z4+ → מנוחה Z3 → בלוק Z5</div></div>
            <span class="wc-badge sprints">ספרינטים</span>
          </div>
          <div class="wc-bar">
            <div class="wb z4-h" style="flex:6">6×45″<br><small>Z4+</small></div>
            <div class="wb z3" style="flex:10">10 דק׳<br><small>Z3</small></div>
            <div class="wb z5" style="flex:8">8×20″<br><small>Z5</small></div>
          </div>
          <div class="wc-desc">בלוק 1: 6 × <b>45 שנ׳ Z4+</b> (160–163) / 1:15 Z2 · מעבר: 10 דק׳ Z3 · בלוק 2: 8 × <b>20 שנ׳ Z5</b> / 40 שנ׳ Z2</div>
        </div>

        <div class="wc glass-card">
          <div class="wc-head">
            <span class="wc-num">04</span>
            <div class="wc-titles"><div class="wc-name">The Finisher 🏆</div><div class="wc-sub">חימום ספרינט + 5 סטים עם התאוששות דינמית</div></div>
            <span class="wc-badge sprints">ספרינטים</span>
          </div>
          <div class="wc-bar">
            <div class="wb z4-h" style="flex:6">6×45″<br><small>Z4+</small></div>
            <div class="wb z5" style="flex:5">5×200מ׳<br><small>Z5</small></div>
            <div class="wb z3" style="flex:5">עד 130<br><small>Z3 התאוששות</small></div>
          </div>
          <div class="wc-desc">חימום: 6 × <b>45 שנ׳ Z4+</b> / 15 שנ׳ מנוחה · מרכזי: 5 × <b>200 מטר Z5</b> + התאוששות Z3 עד דופק 130 BPM</div>
        </div>

      </div>
    </div><!-- /tab-levelup -->

  </section>

"""

with open('C:/Users/user/claude-projects/sup-challenge/index.html', 'r', encoding='utf-8') as f:
    content = f.read()

start_marker = '  <!-- ========== SECTION 5: TRAINING PLAN ========== -->'
end_marker = '  <!-- ========== SECTION 6: GALLERY ========== -->'

start_idx = content.find(start_marker)
end_idx = content.find(end_marker)

if start_idx == -1 or end_idx == -1:
    print(f"ERROR markers not found: start={start_idx}, end={end_idx}")
else:
    new_content = content[:start_idx] + NEW_TRAINING + content[end_idx:]
    with open('C:/Users/user/claude-projects/sup-challenge/index.html', 'w', encoding='utf-8') as f:
        f.write(new_content)
    print(f"Done! New file: {new_content.count(chr(10))} lines")
