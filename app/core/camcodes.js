// أخطاء شاشة الكاميرا (coach/): اسم واضح للمدرب في لوحة المتابعة، ومقابلها في جدول الدرجات WEIGHT
// حتى تُحسب درجة محاولة الكاميرا بالأوزان نفسها التي تُحسب بها المحاكاة.
// الأخطاء التي لها اسم في REASONS (مثل short و led_reversed و no_resistor) لا تحتاج سطراً هنا.
export const CAM_NAMES = {
  red_in_minus:'السلك الأحمر في خط السالب',
  black_in_plus:'السلك الأسود في خط الموجب',
  resistor_in_minus:'رجل المقاومة في خط السالب',
  led_short_in_plus:'رجل اللمبة القصيرة في خط الموجب',
  resistor_across_rails:'المقاومة بين خط الموجب وخط السالب',
  resistor_no_rail:'المقاومة غير موصولة بخط الموجب',
  led_open:'الرجل الثانية للمبة ليست في خط السالب',
  led_not_series:'اللمبة ليست في عمود المقاومة',
  led_other_half:'اللمبة في الجهة الأخرى من المجرى الأوسط',
  not_series:'المقاومة واللمبة ليستا على التوالي',
  camera_unsure:'خطوة لم تتحقق منها الكاميرا',
};
export const CAM_WEIGHT_AS = {
  red_in_minus:'wrong_rail', black_in_plus:'wrong_rail', resistor_in_minus:'wrong_rail', led_short_in_plus:'wrong_rail',
  resistor_across_rails:'open', resistor_no_rail:'open', led_open:'open', led_not_series:'open', led_other_half:'open', not_series:'open',
};
