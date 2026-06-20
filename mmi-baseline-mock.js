/**
 * mmi-baseline-mock.js - Key2MD Baseline MMI Mock
 * A fixed, curated 8-station mock used as the recommended starting point for new students.
 * Run through the MMI circuit engine (mmi-circuit.js) so each station is fully marked and a
 * cross-station baseline is produced. Kept separate from MMI_STATIONS so it never enters the
 * random practice or circuit pool.
 *
 * Each station: id, theme, category (shown in the runner), scenario, prompt1..prompt5.
 * The student chooses a format that controls how many of the five prompts are revealed.
 */
window.MMI_BASELINE_STATIONS = [
  {
    "id": "baseline-motivation",
    "theme": "Motivation",
    "category": "Motivation",
    "scenario": "Medicine is one of the most competitive paths in Australia. For every place there are many strong applicants, and the training is long, demanding and at times thankless. Selectors are less interested in rehearsed reasons than in whether you have thought honestly about what the work really involves.",
    "prompt1": "Why do you want to study medicine?",
    "prompt2": "Many careers help people, including nursing, allied health, teaching and social work. What is it specifically about being a doctor that draws you over those?",
    "prompt3": "Tell me about a time you failed at something that mattered to you. What did it teach you?",
    "prompt4": "The training means years of study, night shifts and decisions that affect real lives, often with little thanks. Which part of that reality are you least prepared for, and how will you cope?",
    "prompt5": "If you are not offered a place this year, what will you do?"
  },
  {
    "id": "baseline-rural",
    "theme": "Rural Health",
    "category": "Rural Health",
    "scenario": "Australians in rural and remote areas have, on average, shorter life expectancy and poorer access to care than people in the cities, and many country towns struggle to attract and keep doctors. You are a medical student on placement in a small town several hours from the nearest base hospital.",
    "prompt1": "Why do you think rural and remote communities have worse health outcomes than the cities?",
    "prompt2": "A patient has driven two hours to see you, and you realise the problem really needs a specialist who is only in the city, a six hour round trip they cannot easily make. How would you handle that consultation?",
    "prompt3": "What do you think would actually make doctors stay rurally for the long term, rather than leaving after a year or two?",
    "prompt4": "Would you personally be willing to work rurally? Be honest.",
    "prompt5": "Some argue medical schools should take more students from rural backgrounds, even at slightly lower scores, because they are far more likely to return and work rurally. Do you agree?"
  },
  {
    "id": "baseline-indigenous",
    "theme": "Indigenous & Cultural Care",
    "category": "Indigenous & Cultural Care",
    "scenario": "Aboriginal and Torres Strait Islander peoples experience a significant gap in health outcomes and life expectancy compared with non-Indigenous Australians. You are a student observing in a clinic. An older Aboriginal man came in with a serious condition but, after a short time, says he wants to go home to his community and stop the tests, against the doctor's strong advice.",
    "prompt1": "Watching this unfold, what do you think might be going on for this man?",
    "prompt2": "The doctor is frustrated and mutters that he is being non-compliant. What are your thoughts on that word?",
    "prompt3": "Why do you think such a large health gap exists between Indigenous and non-Indigenous Australians?",
    "prompt4": "What does cultural safety mean to you, and how is it different from simply being polite or tolerant?",
    "prompt5": "Have you ever been in a situation where you felt like an outsider, or misunderstood because of your background? What did you take from it?"
  },
  {
    "id": "baseline-teamwork",
    "theme": "Teamwork",
    "category": "Teamwork",
    "scenario": "You are part of a five person group assignment worth a major part of your grade, due in three days. One member, who is well liked, has done almost none of the work and has missed every meeting, but has just messaged asking that all five names go on the final submission. Two of the others want to report him; one wants to quietly carry him.",
    "prompt1": "What would you do?",
    "prompt2": "Before deciding anything, what would you want to find out, and from whom?",
    "prompt3": "The group is now split and tense. How would you try to keep it functioning for the next three days?",
    "prompt4": "Tell me about a real time you worked in a team that was not going well. What was your role in it?",
    "prompt5": "Is a good team member always the one who keeps the peace?"
  },
  {
    "id": "baseline-communication",
    "theme": "Communication",
    "category": "Communication",
    "scenario": "A close friend has just had a baby and tells you she has decided not to vaccinate, after reading online that vaccines are linked to autism. When she raised it with a nurse at her local clinic, the nurse laughed at her, and now she feels patronised and angry. She trusts you and asks what you think.",
    "prompt1": "What would you say to her?",
    "prompt2": "She asks, how do you even know your information is any better than mine? How do you respond?",
    "prompt3": "The nurse laughed at her. What do you make of how the nurse handled it?",
    "prompt4": "How do you decide whether a source of health information is trustworthy?",
    "prompt5": "Has social media made people more informed, or less?"
  },
  {
    "id": "baseline-empathy",
    "theme": "Empathy",
    "category": "Empathy",
    "scenario": "It is a busy night in a hospital emergency department and you are a student. A father is standing at the desk, his voice rising, demanding that someone see his young son, who he says is in pain and has been ignored for hours. The staff are stretched thin and other patients are also waiting.",
    "prompt1": "You are asked to go and speak with the father while the team keeps working. What would you say and do?",
    "prompt2": "He turns his anger on you and says, what would you know, you are just a student. How do you respond?",
    "prompt3": "What do you think is really driving his anger?",
    "prompt4": "Long waits in emergency departments make people behave like this. What do you think causes them, and is there anything that could genuinely improve the experience?",
    "prompt5": "Tell me about a time you had to comfort someone who was upset or angry. What did you learn?"
  },
  {
    "id": "baseline-health-issue",
    "theme": "Health Issue",
    "category": "Health Issue",
    "scenario": "Australia faces a growing problem of chronic disease linked to lifestyle, including obesity, type 2 diabetes and heart disease, which now account for a large share of healthcare spending. Some argue individuals should bear more responsibility, and more of the cost, for conditions linked to lifestyle. Others say this blames the patient and ignores poverty, marketing and environment.",
    "prompt1": "What do you think is driving the rise in lifestyle related chronic disease in Australia?",
    "prompt2": "Where do you sit on the personal responsibility question?",
    "prompt3": "Imagine the government proposed that people who smoke or are overweight pay higher taxes, or wait longer for some procedures. What are your thoughts?",
    "prompt4": "A patient keeps returning with problems clearly linked to choices they will not change. How do you keep caring for them without judgement, and without burning out?",
    "prompt5": "Is it a doctor's job to tell people how to live?"
  },
  {
    "id": "baseline-ethics-professionalism",
    "theme": "Ethics & Professionalism",
    "category": "Ethics & Professionalism",
    "scenario": "You are a medical student on a rural placement. At the end of a long shift you walk past the storeroom and see a nurse, who everyone likes, quietly taking medication and putting it in her bag. Startled, she breaks down and begs you not to report her, explaining that the medication is for her seriously ill uncle, who cannot afford it and whose treatment is not covered by the PBS.",
    "prompt1": "What would you say to her in that moment?",
    "prompt2": "What are the competing considerations going through your mind?",
    "prompt3": "What would you actually do next, and who, if anyone, would you tell?",
    "prompt4": "Does it change anything for you that she was stealing for someone else, not herself?",
    "prompt5": "A friend on the same placement says it is not our job to police the staff, just keep your head down. What do you think of that?"
  }
];
