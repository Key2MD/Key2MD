// UCAT question bank + taxonomy.
// Question object shape:
//   id            "ucat-dm-0001"
//   subtest       verbal_reasoning | decision_making | quantitative_reasoning | situational_judgement
//   type          sub-type key, see UCAT_TAXONOMY[subtest].types
//   stimulusId    groups questions under one shared stimulus; null if standalone
//   stimulus      { kind:"text"|"table"|"chart"|"image", content, caption }
//   stem          question text
//   format        single_best | true_false_cant_tell | drag_rank | rating_appropriate | rating_important
//   options       array of option strings (omit for rating formats; they use a fixed scale)
//   answer        option index, or rating index, or ordered array for drag_rank
//   explanation   human-authored, shown after answering
//   difficulty    easy | medium | hard
//   source        always "original"

const UCAT_TAXONOMY = {
  verbal_reasoning: {
    label: "Verbal Reasoning",
    short: "VR",
    questions: 44,
    minutes: 22,
    note: "11 passages",
    types: {
      reading_comprehension: "Reading comprehension",
      true_false_cant_tell: "True / False / Can't tell",
      complete_the_statement: "Complete the statement"
    }
  },
  decision_making: {
    label: "Decision Making",
    short: "DM",
    questions: 35,
    minutes: 37,
    note: "confirm timing",
    types: {
      syllogism: "Syllogisms",
      logical_puzzle: "Logical puzzles",
      interpreting_information: "Interpreting information",
      recognising_assumptions: "Recognising assumptions",
      venn_diagram: "Venn diagrams",
      probabilistic_reasoning: "Probabilistic reasoning"
    }
  },
  quantitative_reasoning: {
    label: "Quantitative Reasoning",
    short: "QR",
    questions: 36,
    minutes: 26,
    note: "charts and graphs",
    types: {
      percentages: "Percentages",
      ratios_proportion: "Ratios and proportion",
      rates: "Rates",
      geometry: "Geometry",
      data_interpretation: "Data interpretation"
    }
  },
  situational_judgement: {
    label: "Situational Judgement",
    short: "SJT",
    questions: 69,
    minutes: null,
    note: "banded 1-4; confirm timing",
    types: {
      appropriateness_rating: "Appropriateness",
      importance_rating: "Importance"
    }
  }
};

const UCAT_FORMATS = {
  single_best: "Single best answer",
  true_false_cant_tell: "True / False / Can't tell",
  drag_rank: "Drag to rank",
  rating_appropriate: "Appropriateness rating",
  rating_important: "Importance rating"
};

// Fixed answer scales for SJT formats. Index 0 = most appropriate / most important.
const UCAT_SJT_SCALES = {
  rating_appropriate: ["Very appropriate", "Appropriate", "Inappropriate", "Very inappropriate"],
  rating_important: ["Very important", "Important", "Of minor importance", "Not important at all"]
};

const UCAT_DIFFICULTIES = ["easy", "medium", "hard"];

const UCAT_QUESTIONS = [
  {
    id: "ucat-vr-001", subtest: "verbal_reasoning", type: "true_false_cant_tell", stimulusId: "ucat-vr-p1",
    stimulus: { kind: "text", content: "The town of Fernvale installed its first public library in 1923. For decades it occupied a single room above the post office. In 1978, following a fundraising campaign led by local schoolteachers, the library moved into a purpose-built building on Main Street, where it remains today. The new building tripled the available shelf space and, for the first time, included a dedicated children's section." },
    stem: "Statement: The library had a dedicated children's section before 1978.",
    format: "true_false_cant_tell", options: ["True", "False", "Can't tell"], answer: 1,
    explanation: "The passage says the children's section appeared for the first time in the 1978 building, so it did not exist before then. The statement is false.",
    difficulty: "easy", source: "original"
  },
  {
    id: "ucat-vr-002", subtest: "verbal_reasoning", type: "true_false_cant_tell", stimulusId: "ucat-vr-p1",
    stimulus: { kind: "text", content: "The town of Fernvale installed its first public library in 1923. For decades it occupied a single room above the post office. In 1978, following a fundraising campaign led by local schoolteachers, the library moved into a purpose-built building on Main Street, where it remains today. The new building tripled the available shelf space and, for the first time, included a dedicated children's section." },
    stem: "Statement: The 1978 fundraising campaign was led by local schoolteachers.",
    format: "true_false_cant_tell", options: ["True", "False", "Can't tell"], answer: 0,
    explanation: "The passage states directly that the campaign was led by local schoolteachers, so the statement is true.",
    difficulty: "easy", source: "original"
  },
  {
    id: "ucat-vr-003", subtest: "verbal_reasoning", type: "true_false_cant_tell", stimulusId: "ucat-vr-p1",
    stimulus: { kind: "text", content: "The town of Fernvale installed its first public library in 1923. For decades it occupied a single room above the post office. In 1978, following a fundraising campaign led by local schoolteachers, the library moved into a purpose-built building on Main Street, where it remains today. The new building tripled the available shelf space and, for the first time, included a dedicated children's section." },
    stem: "Statement: The Main Street building holds more books than any other library in the region.",
    format: "true_false_cant_tell", options: ["True", "False", "Can't tell"], answer: 2,
    explanation: "The passage describes the building's shelf space but never compares it with other libraries in the region, so this cannot be determined from the text.",
    difficulty: "medium", source: "original"
  },
  {
    id: "ucat-vr-004", subtest: "verbal_reasoning", type: "reading_comprehension", stimulusId: "ucat-vr-p2",
    stimulus: { kind: "text", content: "Honeybees communicate the location of food through a movement called the waggle dance. The duration of the waggle indicates the distance to the food source, while the angle of the dance relative to vertical indicates its direction relative to the sun. Foragers that discover richer sources tend to dance more vigorously and for more cycles, recruiting more nestmates to the find." },
    stem: "According to the passage, what does the angle of the waggle dance convey?",
    format: "single_best",
    options: ["The distance to the food source", "The direction of the food relative to the sun", "The richness of the food source", "The number of bees already recruited"],
    answer: 1,
    explanation: "The passage links the angle relative to vertical to direction relative to the sun. Duration signals distance and vigour signals richness.",
    difficulty: "medium", source: "original"
  },
  {
    id: "ucat-vr-005", subtest: "verbal_reasoning", type: "reading_comprehension", stimulusId: "ucat-vr-p2",
    stimulus: { kind: "text", content: "Honeybees communicate the location of food through a movement called the waggle dance. The duration of the waggle indicates the distance to the food source, while the angle of the dance relative to vertical indicates its direction relative to the sun. Foragers that discover richer sources tend to dance more vigorously and for more cycles, recruiting more nestmates to the find." },
    stem: "Which statement is best supported by the passage?",
    format: "single_best",
    options: ["All foragers dance with equal vigour regardless of the source", "A more vigorous dance tends to recruit more nestmates", "The waggle dance signals the time of day", "Bees disregard the quality of a food source"],
    answer: 1,
    explanation: "The passage connects richer sources with more vigorous dancing and more nestmates recruited, which supports the second option and contradicts the others.",
    difficulty: "medium", source: "original"
  },
  {
    id: "ucat-dm-001", subtest: "decision_making", type: "syllogism", stimulusId: null,
    stem: "All registered nurses at the clinic hold a current first-aid certificate. Some staff at the clinic are not registered nurses. Which conclusion must be true?",
    format: "single_best",
    options: ["It cannot be guaranteed that every staff member holds a current first-aid certificate", "No non-nurse staff hold a current first-aid certificate", "Every staff member holds a current first-aid certificate", "Only registered nurses are employed at the clinic"],
    answer: 0,
    explanation: "The premises guarantee certificates only for registered nurses. Non-nurse staff are not covered, so it cannot be guaranteed that all staff hold one. The other options claim more than the premises support.",
    difficulty: "medium", source: "original"
  },
  {
    id: "ucat-dm-002", subtest: "decision_making", type: "probabilistic_reasoning", stimulusId: null,
    stem: "A standard six-sided die is rolled once. What is the probability of rolling a number greater than 4?",
    format: "single_best",
    options: ["1/3", "1/2", "2/3", "1/6"],
    answer: 0,
    explanation: "The outcomes greater than 4 are 5 and 6, so 2 of the 6 equally likely outcomes qualify, giving 2/6 = 1/3.",
    difficulty: "easy", source: "original"
  },
  {
    id: "ucat-dm-003", subtest: "decision_making", type: "venn_diagram", stimulusId: null,
    stem: "In a class, every student studies at least one of biology or chemistry. 18 study biology, 14 study chemistry, and 6 study both. How many students are in the class?",
    format: "single_best",
    options: ["26", "32", "38", "20"],
    answer: 0,
    explanation: "Add the two subjects and subtract the overlap counted twice: 18 + 14 - 6 = 26.",
    difficulty: "medium", source: "original"
  },
  {
    id: "ucat-dm-004", subtest: "decision_making", type: "interpreting_information", stimulusId: null,
    stem: "Four runners finished a race. Maya finished ahead of Sam. Sam finished ahead of Lee. Lee finished ahead of Priya. Who finished last?",
    format: "single_best",
    options: ["Priya", "Lee", "Sam", "Maya"],
    answer: 0,
    explanation: "The order from first to last is Maya, Sam, Lee, Priya, so Priya finished last.",
    difficulty: "easy", source: "original"
  },
  {
    id: "ucat-dm-005", subtest: "decision_making", type: "recognising_assumptions", stimulusId: null,
    stem: "Argument: 'We should hold the school fete on Saturday rather than Sunday, because more families will be able to attend.' Which assumption does this argument most rely on?",
    format: "single_best",
    options: ["Families are more available to attend on a Saturday than on a Sunday", "The fete will raise money for the school", "Saturday usually has better weather than Sunday", "Every family in the town wants to attend the fete"],
    answer: 0,
    explanation: "The conclusion that Saturday is better for attendance depends on families being more available then. Without that assumption the reasoning does not hold.",
    difficulty: "medium", source: "original"
  },
  {
    id: "ucat-qr-001", subtest: "quantitative_reasoning", type: "percentages", stimulusId: null,
    stem: "A jacket priced at $80 is reduced by 25% in a sale. What is the sale price?",
    format: "single_best",
    options: ["$60", "$55", "$65", "$20"],
    answer: 0,
    explanation: "25% of $80 is $20, so the sale price is $80 - $20 = $60.",
    difficulty: "easy", source: "original"
  },
  {
    id: "ucat-qr-002", subtest: "quantitative_reasoning", type: "ratios_proportion", stimulusId: null,
    stem: "A recipe uses flour and sugar in the ratio 3:2. If 600 g of flour is used, how much sugar is needed?",
    format: "single_best",
    options: ["400 g", "300 g", "450 g", "900 g"],
    answer: 0,
    explanation: "600 g of flour represents 3 parts, so one part is 200 g. Sugar is 2 parts, which is 400 g.",
    difficulty: "easy", source: "original"
  },
  {
    id: "ucat-qr-003", subtest: "quantitative_reasoning", type: "rates", stimulusId: null,
    stem: "A train travels 240 km in 3 hours at a constant speed. How long would it take to travel 400 km at the same speed?",
    format: "single_best",
    options: ["5 hours", "4 hours", "6 hours", "4 hours 30 minutes"],
    answer: 0,
    explanation: "The speed is 240 / 3 = 80 km/h, so 400 km takes 400 / 80 = 5 hours.",
    difficulty: "medium", source: "original"
  },
  {
    id: "ucat-qr-004", subtest: "quantitative_reasoning", type: "geometry", stimulusId: null,
    stem: "A rectangular garden is 12 m long and 5 m wide. What is its area?",
    format: "single_best",
    options: ["60 square metres", "34 square metres", "17 square metres", "60 metres"],
    answer: 0,
    explanation: "Area of a rectangle is length times width: 12 x 5 = 60 square metres. 34 is the perimeter and 17 is the sum of the two side lengths.",
    difficulty: "easy", source: "original"
  },
  {
    id: "ucat-qr-005", subtest: "quantitative_reasoning", type: "data_interpretation", stimulusId: null,
    stimulus: { kind: "text", content: "Monthly rainfall (mm)\nJan: 90    Feb: 70    Mar: 110    Apr: 50" },
    stem: "By how many millimetres did the rainfall in March exceed the rainfall in February?",
    format: "single_best",
    options: ["40 mm", "20 mm", "60 mm", "180 mm"],
    answer: 0,
    explanation: "March recorded 110 mm and February 70 mm, a difference of 110 - 70 = 40 mm.",
    difficulty: "easy", source: "original"
  },
  {
    id: "ucat-sjt-001", subtest: "situational_judgement", type: "appropriateness_rating", stimulusId: null,
    stem: "Rahul, a first-year medical student on a hospital ward, notices that a patient with limited mobility has an empty water jug and looks thirsty. Proposed action: Rahul checks with the nurse whether the patient is allowed fluids, and if so refills the jug. How appropriate is this action?",
    format: "rating_appropriate", answer: 0,
    explanation: "Checking for a fluid restriction before acting shows clinical awareness, and helping the patient within his role is caring. This is a very appropriate response.",
    difficulty: "easy", source: "original"
  },
  {
    id: "ucat-sjt-002", subtest: "situational_judgement", type: "appropriateness_rating", stimulusId: null,
    stem: "During a group assignment, Lin discovers that a teammate has copied several paragraphs from a website without referencing them. Proposed action: Lin decides to do nothing and lets the work be submitted as it is. How appropriate is this action?",
    format: "rating_appropriate", answer: 3,
    explanation: "Allowing known plagiarism to be submitted exposes the whole group to an academic misconduct finding and ignores a clear integrity breach, so doing nothing is very inappropriate.",
    difficulty: "medium", source: "original"
  },
  {
    id: "ucat-sjt-003", subtest: "situational_judgement", type: "appropriateness_rating", stimulusId: null,
    stem: "A patient raises their voice at Sofia, a medical student, because their appointment has been delayed. Proposed action: Sofia listens calmly, acknowledges the patient's frustration, and explains she will find out about the delay. How appropriate is this action?",
    format: "rating_appropriate", answer: 0,
    explanation: "Staying calm, acknowledging the patient's feelings, and taking a constructive next step is exactly the right response, so this is very appropriate.",
    difficulty: "easy", source: "original"
  },
  {
    id: "ucat-sjt-004", subtest: "situational_judgement", type: "importance_rating", stimulusId: null,
    stem: "Tom, a medical student, sees a classmate post identifiable details about a patient from placement on social media. When deciding how to respond, how important is the following consideration: the patient's right to confidentiality has been breached.",
    format: "rating_important", answer: 0,
    explanation: "Patient confidentiality is a core professional duty and a breach is serious, so this consideration is very important when deciding how to respond.",
    difficulty: "medium", source: "original"
  },
  {
    id: "ucat-sjt-005", subtest: "situational_judgement", type: "importance_rating", stimulusId: null,
    stem: "A study group is deciding when to meet. When choosing the time, how important is the following consideration: the cafe they usually meet at serves one member's favourite cake.",
    format: "rating_important", answer: 3,
    explanation: "A personal food preference has no real bearing on choosing a study time that works for the group, so this consideration is not important at all.",
    difficulty: "easy", source: "original"
  }
];

if (typeof window !== "undefined") {
  window.UCAT_TAXONOMY = UCAT_TAXONOMY;
  window.UCAT_FORMATS = UCAT_FORMATS;
  window.UCAT_SJT_SCALES = UCAT_SJT_SCALES;
  window.UCAT_DIFFICULTIES = UCAT_DIFFICULTIES;
  window.UCAT_QUESTIONS = UCAT_QUESTIONS;
}
