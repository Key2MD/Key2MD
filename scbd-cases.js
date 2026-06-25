(() => {
 const item = (id, label, answer, keywords, weight, teaching, concepts = [], group = "general", system = "") => ({
  id, label, answer, keywords, weight, teaching, concepts, group, system
 });
 const ix = (id, label, result, keywords, tier, weight, teaching, concepts = []) => ({
  id, label, result, keywords, tier, weight, teaching, concepts
 });
 const mx = (id, label, keywords, weight, teaching) => ({ id, label, keywords, weight, teaching });
 const ddx = (name, why, redFlag = false, aliases = []) => ({ name, why, redFlag, aliases });

 const commonDoubleCheck = [
  "Medication doses, antimicrobial choices, anticoagulation decisions and transfer pathways must be checked against current local Victorian hospital guidance and eTG.",
  "This is an educational drill for clinical reasoning, not patient-specific medical advice."
 ];

 const SCBD_REFERENCES = [
  {
   title: "Australian Commission on Safety and Quality in Health Care - Sepsis Clinical Care Standard",
   url: "https://www.safetyandquality.gov.au/clinical-care-standards/sepsis"
  },
  {
   title: "RACGP - Imaging in adults with acute low back pain",
   url: "https://www.racgp.org.au/clinical-resources/clinical-guidelines/key-racgp-guidelines/view-all-racgp-guidelines/first-do-no-harm/gp-resources/imaging-in-adults-with-acute-low-back-pain"
  },
  {
   title: "Australian Asthma Handbook - Acute asthma in adults and adolescents",
   url: "https://www.asthmahandbook.org.au/acute-asthma/adults-and-adolescents"
  },
  {
   title: "RACGP - Early pregnancy bleeding",
   url: "https://www.racgp.org.au/afp/2016/may/early-pregnancy-bleeding/"
  },
  {
   title: "Stroke Foundation Australia - Signs of stroke",
   url: "https://strokefoundation.org.au/About-Stroke/Learn/signs-of-stroke"
  },
  {
   title: "Australian Government - National Bowel Cancer Screening Program results",
   url: "https://www.health.gov.au/our-work/national-bowel-cancer-screening-program/getting-a-bowel-screening-test/understanding-your-bowel-screening-test-results"
  },
  {
   title: "RACGP - Defining and diagnosing type 2 diabetes",
   url: "https://www.racgp.org.au/clinical-resources/clinical-guidelines/key-racgp-guidelines/view-all-racgp-guidelines/management-of-type-2-diabetes/defining-and-diagnosing-type-2-diabetes"
  },
  {
   title: "Beyond Blue - Suicide safety planning",
   url: "https://www.beyondblue.org.au/mental-health/suicide-prevention/suicide-safety-planning"
  },
  {
   title: "RACGP Mental Health Standards Collaboration - Suicide prevention risk assessment",
   url: "https://mentalhealth.racgp.org.au/guidelines/index/3196c496-3a69-4179-aaa9-97b23d17bb1e"
  }
 ];

 const SCBD_FRAMEWORKS = [
  {
   id: "chest-pain",
   title: "Chest Pain",
   systems: ["Cardiac ischaemia", "Aortic and vascular", "Pulmonary", "Gastro-oesophageal", "Musculoskeletal", "Anxiety after danger is excluded"],
   targeted: ["PQRST pain story", "Radiation to arm, jaw, back", "Autonomic symptoms", "Exertional pattern", "VTE and dissection risks", "Cardiovascular risk profile"],
   redFlags: ["Pain with diaphoresis, dyspnoea or syncope", "Tearing pain to back", "Hypotension", "New neurological deficit", "Persistent pain over 10 minutes despite rest"]
  },
  {
   id: "shortness-breath",
   title: "Shortness Of Breath",
   systems: ["Airways", "Parenchymal lung", "Pleura", "Pulmonary vascular", "Cardiac", "Anaemia and metabolic"],
   targeted: ["Onset and triggers", "Wheeze, cough, sputum, fever", "Chest pain and haemoptysis", "Orthopnoea and oedema", "DVT and VTE risks", "Baseline function"],
   redFlags: ["Silent chest", "Cyanosis or confusion", "Hypoxia", "Haemoptysis", "Pleuritic pain with VTE risk", "Sepsis physiology"]
  },
  {
   id: "abdominal-pain",
   title: "Abdominal Pain",
   systems: ["GI luminal", "Hepatobiliary", "Pancreatic", "Renal and urinary", "Gynaecological", "Vascular and metabolic"],
   targeted: ["Site, migration, severity", "Vomiting and bowel actions", "Fever and rigors", "Pregnancy possibility", "Urinary symptoms", "Peritonism and shock features"],
   redFlags: ["Pregnancy with pain or bleeding", "Syncope", "Peritonism", "GI bleeding", "Sepsis", "Severe pain out of proportion"]
  },
  {
   id: "headache",
   title: "Headache",
   systems: ["Primary headache", "Vascular", "Infective", "Raised intracranial pressure", "Ocular", "Trauma and medication"],
   targeted: ["First or worst headache", "Thunderclap onset", "Fever and neck stiffness", "Neurological symptoms", "Pregnancy, cancer or immunosuppression", "Vision and jaw claudication if older"],
   redFlags: ["Thunderclap", "New focal neurology", "Meningism", "Papilloedema symptoms", "Headache after trauma", "New headache after age 50"]
  },
  {
   id: "fatigue",
   title: "Fatigue",
   systems: ["Anaemia and bleeding", "Endocrine", "Infection and inflammation", "Malignancy", "Sleep and mood", "Medication and substance"],
   targeted: ["Time course and function", "Weight, fever, night sweats", "Bleeding and bowel change", "Thyroid and diabetes symptoms", "Sleep quality", "Mood and safety"],
   redFlags: ["Unintentional weight loss", "GI bleeding", "Exertional chest pain or dyspnoea", "Severe depression or suicidality", "Fever or night sweats"]
  },
  {
   id: "falls-syncope",
   title: "Falls And Syncope",
   systems: ["Mechanical", "Orthostatic", "Cardiac rhythm or structural", "Neurological", "Medication", "Frailty and environment"],
   targeted: ["Before, during and after event", "Loss of consciousness and recovery", "Palpitations or chest pain", "Postural symptoms", "Medication and alcohol", "Injury and function"],
   redFlags: ["Syncope during exertion", "Chest pain or palpitations", "Family sudden death", "New neurology", "Major injury", "Anticoagulant head strike"]
  },
  {
   id: "bowel-habit",
   title: "Altered Bowel Habit",
   systems: ["Functional bowel disorder", "Inflammatory", "Malignancy", "Endocrine", "Medication", "Neurological"],
   targeted: ["Duration and stool form", "Blood or melaena", "Weight loss and anaemia symptoms", "Family history", "Screening history", "Obstructive symptoms"],
   redFlags: ["Rectal bleeding", "Iron deficiency symptoms", "Weight loss", "Nocturnal symptoms", "New change in older patient", "Bowel obstruction"]
  },
  {
   id: "constipation",
   title: "Constipation",
   systems: ["Diet and hydration", "Medication", "Metabolic and endocrine", "Bowel obstruction", "Pelvic floor", "Neurological including Parkinson disease"],
   targeted: ["True constipation versus reduced frequency", "Pain, distension, vomiting", "Blood and weight loss", "Medication burden", "Hypothyroid symptoms", "Tremor, stiffness, gait and anosmia"],
   redFlags: ["Vomiting with distension", "Absolute constipation", "Rectal bleeding", "Weight loss", "New constipation in older patient", "Neurological deficit"]
  },
  {
   id: "palpitations",
   title: "Palpitations",
   systems: ["Arrhythmia", "Thyroid", "Anaemia", "Medication and stimulants", "Panic after danger excluded", "Structural heart disease"],
   targeted: ["Onset, duration and regularity", "Syncope, chest pain, dyspnoea", "Triggers and substances", "Thyroid symptoms", "Past heart disease", "Stroke risk factors"],
   redFlags: ["Syncope", "Chest pain", "Sustained tachycardia", "Known structural heart disease", "Neurological symptoms", "Family sudden death"]
  },
  {
   id: "back-pain",
   title: "Back Pain",
   systems: ["Mechanical", "Radiculopathy", "Cauda equina", "Fracture", "Infection", "Malignancy and inflammatory"],
   targeted: ["Pain pattern and leg symptoms", "Bladder and bowel function", "Saddle sensation", "Weakness and gait", "Fever, IVDU or immunosuppression", "Cancer, trauma or steroid exposure"],
   redFlags: ["Urinary retention or incontinence", "Saddle anaesthesia", "Progressive motor deficit", "Fever with spinal pain", "Cancer history", "Major trauma"]
  },
  {
   id: "fever",
   title: "Fever Or Rigors",
   systems: ["Respiratory", "Urinary", "Abdominal", "Skin and soft tissue", "CNS", "Travel and exposure"],
   targeted: ["Source symptoms", "Sepsis physiology", "Immunosuppression", "Recent surgery or devices", "Pregnancy", "Antibiotic allergies and resistance risks"],
   redFlags: ["Hypotension", "Confusion", "Tachypnoea", "Low urine output", "Non-blanching rash", "Severe pain or rapid deterioration"]
  },
  {
   id: "dizziness",
   title: "Dizziness",
   systems: ["Vertigo", "Presyncope", "Disequilibrium", "Metabolic", "Medication", "Posterior circulation stroke"],
   targeted: ["Define the sensation", "Continuous versus episodic", "Neurological symptoms", "Hearing symptoms", "Postural and cardiac symptoms", "Vascular risk factors"],
   redFlags: ["New ataxia", "Diplopia or dysarthria", "Unilateral weakness or numbness", "Severe new headache", "Syncope with cardiac features", "Inability to walk unaided"]
  },
  {
   id: "mood",
   title: "Low Mood",
   systems: ["Major depression", "Anxiety and trauma", "Bipolar disorder", "Psychosis", "Substance", "Medical mimics"],
   targeted: ["Duration and functional impairment", "Anhedonia, sleep, appetite, guilt", "Suicide thoughts, plan and intent", "Mania screen", "Psychosis screen", "Supports and protective factors"],
   redFlags: ["Current suicidal intent", "Psychosis", "Mania", "Severe self-neglect", "Domestic violence", "Substance withdrawal risk"]
  },
  {
   id: "diabetes",
   title: "Polyuria And Thirst",
   systems: ["Type 1 diabetes", "Type 2 diabetes", "Hyperglycaemic emergency", "Renal and electrolyte", "Medication", "Endocrine"],
   targeted: ["Polyuria, polydipsia and weight change", "Ketosis symptoms", "Infection trigger", "Vision and neuropathy symptoms", "Steroids and antipsychotics", "Family and cardiometabolic risk"],
   redFlags: ["Vomiting or abdominal pain with hyperglycaemia", "Drowsiness", "Dehydration", "Kussmaul breathing", "Pregnancy", "Very high glucose or ketones"]
  }
 ];

 const SCBD_CASES = [
  {
   id: "cp-acs-001",
   title: "Crushing Chest Pain On The Train",
   presentation: "Chest pain",
   frameworkId: "chest-pain",
   setting: "ED",
   difficulty: "easy",
   hidden: false,
   stem: "A 58-year-old man is sent from a suburban GP clinic after 40 minutes of central chest pressure while walking to the train station.",
   finalDiagnosis: "Non-ST elevation acute coronary syndrome",
   diagnosisAliases: ["ACS", "NSTEMI", "unstable angina", "myocardial infarction", "heart attack"],
   recording: [
    "He describes a heavy pressure in the centre of the chest that came on with exertion and has not fully settled with rest.",
    "He looks clammy in the interview and says he felt nauseated and short of breath when the pain peaked.",
    "He has hypertension, smokes 10 cigarettes daily and his father had a heart attack in his early sixties.",
    "He asks whether this could just be reflux because he had a large coffee and pastry before the pain started."
   ],
   ddx: {
    must: [
     ddx("Acute coronary syndrome", "Time-critical and common; exertional pressure with autonomic symptoms is high risk.", true, ["ACS", "NSTEMI", "MI"]),
     ddx("Aortic dissection", "Can present as chest pain and shock; back radiation or neurological signs matter.", true),
     ddx("Pulmonary embolism", "Pleuritic pain, dyspnoea or VTE risks would shift the pathway.", true)
    ],
    should: [
     ddx("Pneumothorax", "Acute dyspnoea and unilateral chest signs are important to exclude."),
     ddx("Pericarditis", "Pleuritic positional pain after viral illness changes investigations."),
     ddx("GORD or oesophageal spasm", "Common mimic but should not lead before red flags are assessed.")
    ],
    bonus: [ddx("Musculoskeletal chest wall pain", "Reproducible pain supports a benign cause after danger is excluded.")]
   },
   history: [
    item("pain-quality", "PQRST chest pain", "Central heavy pressure, 8/10 at onset, still 4/10 after rest.", ["pqrst", "onset", "site", "severity", "character", "pressure", "crushing", "tight", "duration"], 3, "A pressure-like exertional story reflects myocardial oxygen supply-demand mismatch and plaque rupture risk.", ["chestPain"], "hopc"),
    item("radiation", "Radiation", "Radiates to the left arm and jaw, not through to the back.", ["radiation", "arm", "jaw", "neck", "back", "between shoulder blades"], 3, "Arm or jaw radiation supports cardiac visceral afferent pain; tearing back pain would raise dissection.", ["chestPain", "dissection"], "associated"),
    item("autonomic", "Autonomic and dyspnoea symptoms", "He felt sweaty, nauseated and short of breath.", ["sweat", "sweaty", "diaphoresis", "nausea", "vomit", "shortness", "sob", "breathless"], 3, "Autonomic activation and dyspnoea increase the likelihood of ACS and clinical instability.", ["cardiac", "shortnessBreath"], "associated"),
    item("pe-risk", "VTE risk and pleuritic symptoms", "No recent surgery, long-haul travel, calf swelling, haemoptysis or pleuritic pain.", ["PE", "dvt", "clot", "travel", "surgery", "calf", "haemoptysis", "pleuritic"], 2, "PE causes ventilation-perfusion mismatch and pleural irritation; absent VTE risks lower but do not eliminate it.", ["vte"], "redflag"),
    item("cardiac-risk", "Cardiovascular risk factors", "Hypertension, smoker, LDL previously high, father had MI at 62.", ["risk factors", "smoking", "hypertension", "diabetes", "cholesterol", "family history"], 2, "Atherosclerotic risk increases pre-test probability of coronary plaque rupture.", ["cardiac"], "background"),
    item("meds-allergies", "Medications and allergies", "Amlodipine, no antiplatelet or anticoagulant, no known drug allergies.", ["medications", "meds", "blood thinners", "aspirin", "allergies"], 1, "Antiplatelet and anticoagulant decisions depend on bleeding risk, current medicines and allergies.", ["meds"], "background")
   ],
   examination: [
    item("vitals", "Vital signs and general appearance", "BP 158/94, HR 104, RR 20, SpO2 97% RA, afebrile; pale and clammy.", ["vitals", "observations", "blood pressure", "heart rate", "oxygen", "appearance", "clammy"], 3, "Tachycardia and diaphoresis are sympathetic stress signs; hypotension would suggest shock.", ["vitals"], "exam", "general"),
    item("cardiac", "Cardiac examination", "Dual heart sounds, no murmur, JVP not elevated, no peripheral oedema.", ["cardiac exam", "heart sounds", "murmur", "jvp", "oedema", "fluid overload"], 2, "Murmurs or heart failure signs would suggest complications or alternate cardiac pathology.", ["cardiac"], "exam", "cardiovascular"),
    item("resp", "Respiratory examination", "Clear lungs, equal air entry, no pleural rub.", ["respiratory exam", "lungs", "air entry", "crepitations", "wheeze", "rub"], 1, "Normal chest findings make pneumonia, pneumothorax and overt pulmonary oedema less likely.", ["resp"], "exam", "respiratory"),
    item("vascular", "Peripheral pulses and neuro screen", "Equal radial pulses; no focal neurology.", ["pulses", "radial", "blood pressure both arms", "neurology", "neuro"], 2, "Pulse deficit or focal neurology would raise concern for dissection involving branch vessels.", ["dissection", "neuro"], "exam", "vascular")
   ],
   investigations: [
    ix("ecg", "12-lead ECG", "Sinus tachycardia with 1 mm ST depression in V4-V6; no STEMI.", ["ecg", "12 lead", "st elevation", "st depression", "ischemia", "ischaemia"], "bedside", 3, "ECG looks for occlusion, ischaemia and rhythm; it must be early and repeated if symptoms evolve.", ["cardiac"]),
    ix("troponin", "Serial troponins", "Initial troponin mildly elevated; repeat at 2 hours rises significantly.", ["troponin", "serial troponin", "cardiac enzymes"], "bloods", 3, "A rise and/or fall in troponin reflects myocardial injury over time.", ["cardiac"]),
    ix("basic-bloods", "FBE, UEC, LFT, glucose, coagulation", "FBE normal, creatinine normal, glucose 7.8, coagulation normal.", ["fbe", "uec", "electrolytes", "renal", "lft", "glucose", "coag", "bloods"], "bloods", 2, "Baseline renal function and bleeding risk affect contrast, anticoagulation and procedural planning.", ["bloods"]),
    ix("cxr", "Chest X-ray", "No pneumothorax, widened mediastinum or pulmonary oedema.", ["xray", "cxr", "chest x ray", "mediastinum"], "imaging", 1, "CXR helps screen for alternate dangerous thoracic pathology but does not rule out ACS.", ["imaging"]),
    ix("cardiology", "Cardiology risk stratification", "High-risk NSTEMI pathway; inpatient cardiology review for angiography consideration.", ["cardiology", "angiogram", "angiography", "risk stratification", "echo"], "special", 2, "Ongoing ischaemia or rising biomarkers require senior-led invasive and medical planning.", ["cardiac"])
   ],
   management: [
    mx("ed", "Treat as time-critical ACS in ED with senior review", ["ed", "hospital", "urgent", "senior", "acs pathway", "monitored bed"], 3, "Early monitored care reduces missed deterioration and enables rapid reperfusion decisions."),
    mx("monitoring", "Continuous monitoring, IV access, repeat ECGs and symptom review", ["monitor", "telemetry", "iv access", "repeat ecg", "serial ecg", "observations"], 2, "ACS can evolve; rhythm instability and dynamic ST changes change urgency."),
    mx("meds", "Antiplatelet, anticoagulation, analgesia and nitrates only as clinically appropriate under protocol", ["aspirin", "antiplatelet", "anticoag", "heparin", "analgesia", "nitrate", "gt n"], 2, "Therapy reduces thrombosis and pain but must account for bleeding, blood pressure and local guidance."),
    mx("risk", "Address smoking, lipids, BP and diabetes risk after acute stabilisation", ["smoking", "statin", "lipid", "blood pressure", "risk factor", "cardiac rehab"], 1, "Secondary prevention targets the atherosclerotic process that caused the event."),
    mx("safety", "Safety-net chest pain and ambulance advice", ["safety net", "000", "ambulance", "return", "worsening"], 1, "Persistent or recurrent ischaemic symptoms are an emergency, not a wait-and-see problem.")
   ],
   doubleCheck: commonDoubleCheck
  },
  {
   id: "sob-pe-002",
   title: "Sudden Breathlessness After A Flight",
   presentation: "Shortness of breath",
   frameworkId: "shortness-breath",
   setting: "ED",
   difficulty: "medium",
   hidden: false,
   stem: "A 34-year-old woman presents with sudden shortness of breath and right-sided pleuritic chest pain two days after returning from Europe.",
   finalDiagnosis: "Pulmonary embolism",
   diagnosisAliases: ["PE", "pulmonary embolus", "venous thromboembolism", "VTE"],
   recording: [
    "She says the pain is sharp and worse on deep inspiration, with no wheeze and only a dry cough.",
    "She recently completed a long-haul flight and has noticed mild left calf tightness.",
    "She uses the combined oral contraceptive pill and has no known cardiorespiratory disease.",
    "She is anxious because she feels she cannot get a full breath in."
   ],
   ddx: {
    must: [
     ddx("Pulmonary embolism", "Pleuritic pain, acute dyspnoea and VTE risks are the core pattern.", true, ["PE", "VTE"]),
     ddx("Acute coronary syndrome", "Can present with dyspnoea, chest discomfort and autonomic symptoms.", true),
     ddx("Pneumothorax", "Sudden pleuritic pain and dyspnoea need chest exam and imaging.", true)
    ],
    should: [
     ddx("Pneumonia", "Fever, sputum and focal crepitations would support infection."),
     ddx("Asthma", "Wheeze, triggers and response to bronchodilator would support airways disease."),
     ddx("Anxiety or panic", "A diagnosis of exclusion after dangerous causes are assessed.")
    ],
    bonus: [ddx("Pericarditis", "Pleuritic and positional chest pain after viral illness can mimic PE.")]
   },
   history: [
    item("dyspnoea", "Onset and character of dyspnoea", "Abrupt onset this morning; worse with walking and deep breaths.", ["onset", "sudden", "shortness", "sob", "breathless", "exertion"], 3, "Abrupt dyspnoea suggests vascular, pleural or airway events rather than gradual infection alone.", ["shortnessBreath"], "hopc"),
    item("pleuritic", "Pleuritic chest pain and haemoptysis", "Sharp right chest pain on inspiration; no haemoptysis.", ["pleuritic", "inspiration", "deep breath", "haemoptysis", "coughing blood"], 3, "PE can infarct peripheral lung and irritate pleura; haemoptysis is a classic but insensitive clue.", ["vte", "chestPain"], "associated"),
    item("vte-risk", "VTE risk factors", "Long-haul flight, combined pill, no recent surgery, cancer or pregnancy.", ["flight", "travel", "pill", "oestrogen", "estrogen", "surgery", "immobile", "cancer", "pregnant"], 3, "Venous stasis plus oestrogen exposure increases thrombus formation risk.", ["vte", "pregnancy"], "background"),
    item("dvt", "DVT symptoms", "Left calf has been tight and mildly swollen since the flight.", ["calf", "leg swelling", "dvt", "painful leg", "tender calf"], 3, "A leg clot can embolise to pulmonary arteries, increasing pulmonary vascular resistance and dead space.", ["vte"], "associated"),
    item("infective", "Infective symptoms", "No fever, rigors or purulent sputum.", ["fever", "rigors", "sputum", "productive", "infection"], 1, "Absence of infection features makes pneumonia less likely, though not impossible.", ["infection"], "associated"),
    item("asthma-cardio", "Airways and cardiac history", "No asthma, wheeze, orthopnoea, oedema or known heart disease.", ["asthma", "wheeze", "orthopnoea", "pnd", "oedema", "heart failure"], 1, "This helps separate airway narrowing and cardiac congestion from vascular causes.", ["resp", "cardiac"], "background")
   ],
   examination: [
    item("vitals", "Vital signs and oxygenation", "HR 118, RR 26, BP 124/76, SpO2 92% RA, afebrile.", ["vitals", "observations", "heart rate", "respiratory rate", "oxygen", "sats", "spo2"], 3, "Tachycardia, tachypnoea and hypoxaemia are physiological consequences of impaired perfusion and gas exchange.", ["vitals", "shortnessBreath"], "exam", "general"),
    item("chest", "Chest examination", "Clear lungs bilaterally with no wheeze or focal crackles.", ["respiratory exam", "chest exam", "lungs", "wheeze", "crackles", "air entry"], 2, "A normal chest exam with hypoxia is a classic PE trap because the problem is perfusion, not airways.", ["resp"], "exam", "respiratory"),
    item("legs", "Leg examination", "Left calf is 2 cm larger than right and mildly tender; no cellulitis.", ["leg exam", "calf", "swelling", "tenderness", "dvt signs"], 3, "Unilateral swelling supports venous thrombosis as the embolic source.", ["vte"], "exam", "vascular"),
    item("cardiac", "Cardiac examination", "Tachycardic regular rhythm, no murmur, no signs of heart failure.", ["cardiac exam", "heart sounds", "murmur", "jvp", "oedema"], 1, "Right heart strain signs would imply larger clot burden and higher risk.", ["cardiac"], "exam", "cardiovascular")
   ],
   investigations: [
    ix("ecg", "ECG", "Sinus tachycardia, no ischaemic ST changes.", ["ecg", "sinus tachycardia", "arrhythmia"], "bedside", 2, "ECG screens for ACS and arrhythmia; sinus tachycardia is common but non-specific in PE.", ["cardiac"]),
    ix("pregnancy", "Pregnancy test", "Urine hCG negative.", ["pregnancy test", "hcg", "urine pregnancy"], "bedside", 2, "Pregnancy changes imaging and anticoagulation decisions and is itself a VTE risk.", ["pregnancy"]),
    ix("bloods", "FBE, UEC, coagulation and D-dimer if appropriate", "FBE normal, renal function normal, D-dimer elevated.", ["fbe", "uec", "renal", "coag", "d dimer", "bloods"], "bloods", 2, "D-dimer is useful mainly in low-risk patients; renal function informs contrast imaging.", ["bloods", "vte"]),
    ix("ctpa", "CT pulmonary angiogram", "Segmental PE in the right lower lobe; no massive central embolus.", ["ctpa", "ct pulmonary", "pulmonary angiogram", "ct chest"], "imaging", 3, "CTPA visualises pulmonary arterial filling defects and assesses clot burden.", ["imaging", "vte"]),
    ix("us-leg", "Compression ultrasound leg", "Non-compressible left popliteal vein consistent with DVT.", ["doppler", "leg ultrasound", "compression ultrasound", "venous ultrasound"], "imaging", 1, "Finding DVT supports the diagnosis and may help if chest imaging is delayed or contraindicated.", ["vte"])
   ],
   management: [
    mx("ed", "ED management with risk stratification and senior review", ["ed", "hospital", "senior", "risk stratification", "admit"], 3, "PE risk depends on haemodynamics, oxygenation and right heart strain."),
    mx("oxygen", "Oxygen, analgesia, IV access and monitoring", ["oxygen", "analgesia", "iv access", "monitor", "observations"], 2, "Supportive care corrects hypoxaemia while anticoagulation decisions are made."),
    mx("anticoag", "Anticoagulation if not contraindicated", ["anticoagulation", "heparin", "apixaban", "rivaroxaban", "blood thinner"], 3, "Anticoagulation prevents clot propagation while endogenous fibrinolysis resolves clot."),
    mx("contra", "Assess bleeding risk, pregnancy status and provoking factors", ["bleeding risk", "contraindication", "pregnancy", "provoked", "pill", "oestrogen"], 2, "Treatment choice and duration depend on bleeding risk and whether the event was provoked."),
    mx("safety", "Safety-net for worsening dyspnoea, syncope, bleeding and recurrence", ["safety net", "syncope", "bleeding", "worsening", "return", "000"], 1, "PE can deteriorate and anticoagulation can cause bleeding; both require explicit advice.")
   ],
   doubleCheck: commonDoubleCheck
  },
  {
   id: "abdo-ectopic-003",
   title: "Lower Abdominal Pain And Spotting",
   presentation: "Abdominal pain",
   frameworkId: "abdominal-pain",
   setting: "ED",
   difficulty: "easy",
   hidden: false,
   stem: "A 27-year-old woman presents with left lower abdominal pain and light vaginal spotting.",
   finalDiagnosis: "Ectopic pregnancy",
   diagnosisAliases: ["ectopic", "tubal pregnancy", "ruptured ectopic"],
   recording: [
    "She has had crampy left-sided pain for six hours and feels light-headed when standing.",
    "Her last period was about seven weeks ago but her cycles are irregular.",
    "She had chlamydia treated several years ago and currently uses no reliable contraception.",
    "She is worried she may be miscarrying but has not done a pregnancy test."
   ],
   ddx: {
    must: [
     ddx("Ectopic pregnancy", "Pregnancy plus pain or bleeding is ectopic until proven otherwise.", true),
     ddx("Miscarriage", "Common early pregnancy bleeding cause and can cause significant blood loss.", true),
     ddx("Ovarian torsion", "Unilateral pain with nausea can threaten ovarian viability.", true)
    ],
    should: [
     ddx("Pelvic inflammatory disease", "Prior STI and pelvic pain can reflect ascending infection."),
     ddx("Appendicitis", "Lower abdominal pain can be atypical, especially early."),
     ddx("Renal colic or UTI", "Urinary symptoms and haematuria would redirect workup.")
    ],
    bonus: [ddx("Gastroenteritis", "Usually has diarrhoea or vomiting and lacks pregnancy risk.")]
   },
   history: [
    item("pregnancy", "LMP and pregnancy possibility", "LMP around seven weeks ago; she is sexually active with no reliable contraception.", ["lmp", "last period", "pregnant", "pregnancy", "contraception", "sexually active"], 3, "Ectopic pregnancy cannot be excluded clinically; location must be established when pregnancy is possible.", ["pregnancy"], "hopc"),
    item("bleeding", "Bleeding amount and products", "Light spotting only, no clots or tissue passed.", ["bleeding", "spotting", "clots", "products", "pads", "tissue"], 2, "Bleeding pattern helps differentiate miscarriage spectrum, ectopic and cervical causes.", ["pregnancy"], "associated"),
    item("pain", "Pain severity, location and shoulder tip pain", "Left iliac fossa pain 7/10; no shoulder tip pain yet.", ["site", "severity", "left", "shoulder tip", "radiation", "pain"], 3, "Shoulder tip pain suggests diaphragmatic irritation from intraperitoneal blood.", ["abdominalPain", "pregnancy"], "hopc"),
    item("shock", "Syncope and haemodynamic symptoms", "Light-headed on standing; no collapse.", ["syncope", "collapse", "dizzy", "light headed", "faint", "shock"], 3, "Young patients can compensate until blood loss is substantial, so presyncope is important.", ["vitals", "pregnancy"], "redflag"),
    item("ectopic-risk", "Ectopic risk factors", "Past chlamydia, no prior ectopic, no IUD, no IVF.", ["chlamydia", "sti", "pid", "ectopic before", "iud", "ivf", "tubal surgery"], 2, "Tubal scarring impairs embryo transport, increasing implantation outside the uterus.", ["pregnancy"], "background"),
    item("urinary-bowel", "Urinary and bowel symptoms", "No dysuria, haematuria, diarrhoea or constipation.", ["dysuria", "urinary", "haematuria", "bowel", "diarrhoea", "constipation"], 1, "This screens for renal, urinary and gastrointestinal mimics.", ["urinary", "bowel"], "associated")
   ],
   examination: [
    item("vitals", "Vital signs and pallor", "BP 96/62, HR 112, afebrile; looks pale and uncomfortable.", ["vitals", "blood pressure", "heart rate", "pallor", "shock"], 3, "Tachycardia and low blood pressure suggest volume loss until proven otherwise.", ["vitals"], "exam", "general"),
    item("abdo", "Abdominal tenderness and peritonism", "Left iliac fossa tenderness with mild guarding, no generalised rigidity.", ["abdominal exam", "tenderness", "guarding", "peritonism", "rebound"], 3, "Peritoneal signs suggest blood or inflammatory fluid irritating the peritoneum.", ["abdominalPain"], "exam", "abdomen"),
    item("pelvic", "Speculum and bimanual examination if appropriate", "Small amount of blood from cervix; cervical motion and left adnexal tenderness.", ["speculum", "pelvic", "bimanual", "cervical motion", "adnexal"], 2, "Adnexal and cervical motion tenderness localise pathology to pelvic organs but are not definitive.", ["pregnancy"], "exam", "pelvic"),
    item("shoulder", "Shoulder tip and cardiorespiratory check", "No shoulder tip tenderness; chest clear.", ["shoulder tip", "chest", "respiratory", "referred pain"], 1, "Shoulder tip pain would imply diaphragmatic irritation from intra-abdominal blood.", ["abdominalPain"], "exam", "general")
   ],
   investigations: [
    ix("hcg", "Urine or serum hCG", "Urine pregnancy test positive; quantitative serum hCG 2400 IU/L.", ["pregnancy test", "hcg", "beta hcg", "urine pregnancy"], "bedside", 3, "A pregnancy test is mandatory in reproductive-age abdominal pain because it changes the risk map immediately.", ["pregnancy"]),
    ix("bloods", "FBE, group and hold, UEC", "Hb 104, group and hold sent, renal function normal.", ["fbe", "haemoglobin", "group and hold", "crossmatch", "uec", "bloods"], "bloods", 3, "Haemoglobin and blood bank preparation matter because rupture can cause rapid haemorrhage.", ["bloods"]),
    ix("tvs", "Transvaginal pelvic ultrasound", "No intrauterine pregnancy; left adnexal mass with small free fluid.", ["transvaginal", "pelvic ultrasound", "tvs", "ultrasound", "adnexal", "free fluid"], "imaging", 3, "Pregnancy location, not just viability, is the key question.", ["pregnancy", "imaging"]),
    ix("rh", "Blood group and Rh status", "O negative.", ["blood group", "rh", "rhesus", "antibody"], "bloods", 2, "Rh D negative patients may need anti-D for sensitising events depending on gestation and local guidance.", ["pregnancy"]),
    ix("sti", "STI testing if stable", "Chlamydia and gonorrhoea swabs sent.", ["sti", "chlamydia", "gonorrhoea", "swabs"], "special", 1, "STIs can be both a differential and a future ectopic risk factor.", ["infection"])
   ],
   management: [
    mx("urgent", "Urgent ED/gynaecology escalation", ["urgent", "gynae", "gynaecology", "ed", "hospital", "senior"], 3, "Ectopic pregnancy can rupture and become life-threatening."),
    mx("resus", "Assess haemodynamic stability, IV access, fluids and blood preparation", ["iv access", "fluids", "resuscitation", "crossmatch", "blood", "unstable"], 3, "The immediate danger is intraperitoneal haemorrhage."),
    mx("definitive", "Discuss surgical or medical management with specialist team", ["laparoscopy", "surgery", "methotrexate", "medical management", "salpingectomy"], 2, "Management depends on stability, hCG, ultrasound features and follow-up reliability."),
    mx("rh", "Consider Rh D immunoglobulin if indicated", ["anti d", "rh", "rhesus", "immunoglobulin"], 1, "Preventing Rh sensitisation protects future pregnancies."),
    mx("support", "Provide sensitive counselling and clear return precautions", ["counselling", "support", "safety net", "return", "pain", "bleeding"], 1, "Early pregnancy complications are medically risky and emotionally distressing.")
   ],
   doubleCheck: [
    "Anti-D indications and methotrexate eligibility should be checked against local early pregnancy unit guidance.",
    ...commonDoubleCheck
   ]
  },
  {
   id: "headache-sah-004",
   title: "Worst Headache During Exercise",
   presentation: "Headache",
   frameworkId: "headache",
   setting: "ED",
   difficulty: "medium",
   hidden: false,
   stem: "A 46-year-old woman presents after a sudden severe headache that began during a gym class.",
   finalDiagnosis: "Subarachnoid haemorrhage",
   diagnosisAliases: ["SAH", "subarachnoid hemorrhage", "aneurysmal bleed"],
   recording: [
    "She says it was like being hit in the head and reached maximum intensity within a minute.",
    "She vomited once and now has photophobia and neck discomfort.",
    "She has no migraine history and is worried because her mother died suddenly from a brain aneurysm.",
    "She took ibuprofen without relief."
   ],
   ddx: {
    must: [
     ddx("Subarachnoid haemorrhage", "Thunderclap onset is a do-not-miss vascular red flag.", true, ["SAH"]),
     ddx("Meningitis or encephalitis", "Fever, neck stiffness and altered mental state need urgent exclusion.", true),
     ddx("Cerebral venous sinus thrombosis", "Can present with severe headache, especially with prothrombotic risks.", true)
    ],
    should: [
     ddx("Migraine", "Photophobia and vomiting overlap, but first thunderclap is not typical migraine."),
     ddx("Cervical artery dissection", "Neck pain and neuro signs after exertion or trauma matter."),
     ddx("Intracerebral haemorrhage", "Severe headache with neurology or hypertension can reflect bleeding.")
    ],
    bonus: [ddx("Exertional headache", "Benign only after dangerous causes are excluded.")]
   },
   history: [
    item("thunderclap", "Onset speed and worst headache", "Instant onset, maximal within one minute, worst headache of her life.", ["thunderclap", "sudden", "maximal", "worst headache", "instant", "rapid onset"], 3, "A thunderclap time course suggests acute vascular bleeding or vessel pathology.", ["headache", "neuro"], "hopc"),
    item("meningism", "Neck stiffness, photophobia and fever", "Neck stiffness and photophobia; no fever or rash.", ["neck stiffness", "photophobia", "fever", "rash", "meningism"], 3, "Meningeal irritation occurs when blood or infection irritates the meninges.", ["headache", "infection"], "associated"),
    item("vomit", "Vomiting and loss of consciousness", "Vomited once; no loss of consciousness or seizure.", ["vomit", "nausea", "collapse", "loss consciousness", "seizure"], 2, "Raised intracranial pressure or meningeal irritation can trigger vomiting and collapse.", ["headache", "neuro"], "associated"),
    item("neuro", "Focal neurological symptoms", "No weakness, numbness, diplopia, dysarthria or ataxia.", ["weakness", "numbness", "vision", "diplopia", "speech", "ataxia", "neuro"], 3, "Focal deficits point to haemorrhage, stroke, mass or dissection.", ["neuro"], "redflag"),
    item("risk", "Aneurysm, anticoagulant and family history", "Mother died from aneurysmal bleed; not anticoagulated.", ["aneurysm", "family history", "anticoagulant", "blood thinner", "warfarin", "doac"], 2, "Family history and anticoagulation change risk and urgency.", ["meds", "neuro"], "background"),
    item("migraine", "Prior headache pattern", "No previous migraine or similar headaches.", ["migraine", "previous headache", "usual", "pattern", "new"], 2, "A new severe headache is more concerning than a familiar recurrent primary headache.", ["headache"], "background")
   ],
   examination: [
    item("vitals", "Vital signs", "BP 168/96, HR 92, afebrile, GCS 15.", ["vitals", "blood pressure", "gcs", "temperature", "observations"], 2, "Hypertension may be reactive or contributory; fever would support infection.", ["vitals"], "exam", "general"),
    item("neuro-exam", "Full neurological examination", "Cranial nerves, power, sensation and coordination are normal.", ["neuro exam", "cranial nerves", "power", "sensation", "coordination", "ataxia"], 3, "A normal neuro exam does not rule out SAH, but deficits suggest complications or alternatives.", ["neuro"], "exam", "neurological"),
    item("neck", "Meningism", "Reduced neck flexion due to pain; Kernig not clearly positive.", ["neck stiffness", "meningism", "kernig", "brudzinski", "neck flexion"], 3, "Blood in the subarachnoid space chemically irritates meninges.", ["headache"], "exam", "neurological"),
    item("fundoscopy", "Fundoscopy and visual fields", "No papilloedema; visual fields grossly intact.", ["fundoscopy", "papilloedema", "visual fields", "eyes"], 1, "Papilloedema suggests raised intracranial pressure but can be absent early.", ["neuro"], "exam", "eyes")
   ],
   investigations: [
    ix("ct", "Urgent non-contrast CT brain", "CT shows subarachnoid blood in the basal cisterns.", ["ct brain", "ct head", "non contrast", "scan"], "imaging", 3, "Acute blood is hyperdense on CT and early imaging is the first-line emergency test.", ["imaging", "neuro"]),
    ix("cta", "CT angiography", "Anterior communicating artery aneurysm seen.", ["ct angiogram", "cta", "aneurysm", "angiography"], "imaging", 2, "Identifying an aneurysm guides neurosurgical or interventional treatment.", ["imaging", "neuro"]),
    ix("bloods", "FBE, UEC, coagulation and group and hold", "Platelets normal, INR normal, renal function normal.", ["fbe", "uec", "coag", "inr", "platelets", "group and hold", "bloods"], "bloods", 2, "Coagulation and platelets matter before procedures and for bleeding risk.", ["bloods"]),
    ix("lp", "Lumbar puncture if CT negative and suspicion remains", "Not required here because CT is positive.", ["lumbar puncture", "lp", "xanthochromia", "csf"], "special", 2, "LP can detect xanthochromia when CT is negative but timing and safety matter.", ["neuro"]),
    ix("ecg", "ECG and cardiac monitoring", "Sinus rhythm; no acute ischaemic changes.", ["ecg", "monitoring", "cardiac"], "bedside", 1, "SAH can provoke arrhythmias and ECG changes through catecholamine surge.", ["cardiac"])
   ],
   management: [
    mx("ed", "Immediate ED/neurosurgical escalation", ["ed", "neurosurgery", "urgent", "hospital", "icu", "senior"], 3, "Rebleeding and hydrocephalus can be rapidly fatal."),
    mx("support", "Analgesia, antiemetic, IV access and close neurological observations", ["analgesia", "antiemetic", "iv", "neuro obs", "monitor"], 2, "Comfort and serial neurological assessment help detect deterioration."),
    mx("bp", "Blood pressure management under senior protocol", ["blood pressure", "bp control", "hypertension"], 2, "Excess pressure may increase rebleed risk, but overcorrection can reduce cerebral perfusion."),
    mx("avoid", "Avoid anticoagulants and unnecessary delays to definitive aneurysm care", ["avoid anticoag", "no anticoag", "aneurysm", "clipping", "coiling"], 2, "Definitive aneurysm treatment reduces rebleeding risk."),
    mx("safety", "Explain seriousness to patient/family and prepare transfer if needed", ["family", "explain", "transfer", "retrieval", "support"], 1, "Clear communication and logistics matter in time-critical neurosurgical illness.")
   ],
   doubleCheck: commonDoubleCheck
  },
  {
   id: "fatigue-crc-005",
   title: "Tired All The Time",
   presentation: "Fatigue",
   frameworkId: "fatigue",
   setting: "GP",
   difficulty: "medium",
   hidden: true,
   stem: "A 62-year-old man attends his GP because he has been tired for three months and is now breathless walking uphill.",
   finalDiagnosis: "Iron deficiency anaemia from colorectal cancer",
   diagnosisAliases: ["bowel cancer", "colorectal cancer", "colon cancer", "iron deficiency anaemia", "IDA"],
   recording: [
    "He initially blamed work stress and poor sleep but now notices reduced exercise tolerance.",
    "He has had looser stools and occasional dark red blood on toilet paper but thought it was haemorrhoids.",
    "He has lost 5 kg unintentionally over four months.",
    "He never completed his mailed bowel screening kit."
   ],
   ddx: {
    must: [
     ddx("Iron deficiency anaemia from GI blood loss", "Fatigue plus exertional dyspnoea and bowel symptoms is cancer until excluded.", true, ["IDA", "anaemia"]),
     ddx("Colorectal cancer", "Older age, weight loss, bowel change and bleeding are high-yield red flags.", true, ["bowel cancer"]),
     ddx("Haematological malignancy", "Weight loss and fatigue can reflect marrow or systemic disease.", true)
    ],
    should: [
     ddx("Hypothyroidism", "Fatigue, cold intolerance, constipation and weight gain would support it."),
     ddx("Depression", "Common but should not explain red flags prematurely."),
     ddx("Sleep apnoea", "Poor sleep and daytime somnolence can cause fatigue.")
    ],
    bonus: [ddx("Chronic infection or inflammatory disease", "Fever, sweats and inflammatory markers would help.")]
   },
   history: [
    item("fatigue", "Fatigue time course and function", "Progressive fatigue for three months; now breathless on hills.", ["fatigue", "tired", "energy", "duration", "function", "exercise tolerance", "breathless"], 2, "Progressive functional decline suggests physiological disease such as anaemia, heart failure or malignancy.", ["fatigue", "anaemia"], "hopc"),
    item("gi-bleed", "Rectal bleeding, melaena and stool colour", "Occasional dark red blood mixed with stool; no black tarry stools.", ["blood", "rectal bleeding", "melaena", "melena", "stool colour", "dark stool"], 3, "Chronic occult or overt GI bleeding depletes iron stores and causes microcytic anaemia.", ["bowel", "anaemia"], "redflag"),
    item("bowel-change", "Altered bowel habit", "Looser stools and urgency for two months.", ["bowel habit", "diarrhoea", "constipation", "loose", "urgency", "change"], 3, "A tumour can alter motility, calibre or mucosal bleeding as it narrows or irritates bowel.", ["bowel"], "associated"),
    item("weight", "Weight loss and systemic symptoms", "Lost 5 kg unintentionally; no fever or night sweats.", ["weight loss", "appetite", "night sweats", "fever", "constitutional"], 3, "Unintentional weight loss reflects catabolism, reduced intake or malignancy-related inflammation.", ["constitutional"], "redflag"),
    item("screening", "Bowel screening and family history", "Did not complete NBCSP kit; father had bowel cancer at 78.", ["screening", "fobt", "ifobt", "bowel screen", "family history", "colon cancer"], 2, "Screening detects occult bleeding before symptoms; family history modifies risk.", ["bowel"], "background"),
    item("thyroid-mood-sleep", "Thyroid, mood and sleep screen", "No cold intolerance, constipation, low mood or witnessed apnoeas.", ["thyroid", "cold intolerance", "brittle hair", "dry skin", "mood", "sleep", "snoring"], 1, "These common fatigue causes still need screening, especially when initial symptoms are vague.", ["thyroid", "mood", "sleep"], "associated")
   ],
   examination: [
    item("vitals-pallor", "Vitals and pallor", "HR 96, BP 132/78, pale conjunctivae, no fever.", ["vitals", "pallor", "conjunctiva", "heart rate", "temperature"], 3, "Pallor and tachycardia reflect reduced oxygen-carrying capacity and compensation.", ["anaemia", "vitals"], "exam", "general"),
    item("abdo", "Abdominal examination", "Soft abdomen, mild right lower quadrant fullness, no tenderness.", ["abdominal exam", "mass", "tenderness", "organomegaly", "fullness"], 2, "Right-sided bowel cancers can grow large before obstructing and often present through anaemia.", ["bowel"], "exam", "abdomen"),
    item("pr", "PR examination", "No external haemorrhoids; no palpable rectal mass; stool appears dark red.", ["pr", "rectal exam", "digital rectal", "haemorrhoids", "rectal mass"], 2, "A normal PR does not rule out proximal colorectal cancer but can find low rectal lesions.", ["bowel"], "exam", "rectal"),
    item("lymph", "Lymph nodes and systemic exam", "No lymphadenopathy, chest clear, no oedema.", ["lymph nodes", "lymphadenopathy", "chest", "oedema"], 1, "Lymphadenopathy would broaden concern to lymphoma or disseminated malignancy.", ["constitutional"], "exam", "general")
   ],
   investigations: [
    ix("fbe-iron", "FBE and iron studies", "Hb 86 g/L, MCV 72, ferritin 8, transferrin saturation low.", ["fbe", "haemoglobin", "hemoglobin", "mcv", "ferritin", "iron studies"], "bloods", 3, "Microcytosis with low ferritin confirms depleted iron stores until a cause is found.", ["anaemia", "bloods"]),
    ix("renal-lft-crp", "UEC, LFT, CRP and coeliac screen", "Renal and LFT normal, CRP mildly raised, coeliac screen negative.", ["uec", "renal", "lft", "crp", "coeliac", "celiac"], "bloods", 1, "These assess alternative anaemia causes and procedural baseline.", ["bloods"]),
    ix("fit", "Faecal occult blood or FIT if appropriate", "Positive, but symptoms and iron deficiency already warrant colonoscopy referral.", ["fobt", "fit", "ifobt", "stool blood"], "special", 1, "A positive screening test suggests bleeding but diagnostic colonoscopy is needed in symptomatic IDA.", ["bowel"]),
    ix("colonoscopy", "Colonoscopy", "Ulcerated caecal mass; biopsy confirms adenocarcinoma.", ["colonoscopy", "scope", "biopsy", "bowel camera"], "special", 3, "Colonoscopy visualises and samples the bleeding lesion.", ["bowel"]),
    ix("staging", "CT chest/abdomen/pelvis for staging", "Local caecal tumour, no distant metastases on initial staging CT.", ["ct", "staging", "ct cap", "chest abdomen pelvis"], "imaging", 2, "Staging guides surgical and oncology planning.", ["imaging"])
   ],
   management: [
    mx("refer", "Urgent colorectal or gastroenterology referral for symptomatic iron deficiency", ["urgent referral", "colorectal", "gastroenterology", "colonoscopy"], 3, "New iron deficiency anaemia in an older man is GI blood loss until proven otherwise."),
    mx("stabilise", "Assess severity, transfusion threshold and iron replacement needs", ["iron", "transfusion", "symptomatic anaemia", "replace iron"], 2, "Correcting anaemia improves oxygen delivery while the cause is treated."),
    mx("cancer", "Discuss likely cancer pathway sensitively and arrange staging", ["cancer pathway", "staging", "ct", "biopsy", "multidisciplinary"], 2, "Early staging and multidisciplinary planning improve treatment sequencing."),
    mx("safety", "Safety-net worsening bleeding, chest pain, syncope or dyspnoea", ["safety net", "bleeding", "syncope", "chest pain", "breathless"], 1, "Anaemia can decompensate with ongoing bleeding or cardiac stress."),
    mx("screen-family", "Discuss bowel screening and family implications later", ["screening", "family", "nbcsp", "relatives"], 1, "Once acute care is underway, prevention and family risk become important.")
   ],
   doubleCheck: [
    "Australian bowel screening ages and symptomatic referral pathways change over time; confirm against NBCSP and local HealthPathways.",
    ...commonDoubleCheck
   ]
  },
  {
   id: "falls-orthostatic-006",
   title: "Three Falls This Month",
   presentation: "Falls",
   frameworkId: "falls-syncope",
   setting: "GP",
   difficulty: "medium",
   hidden: false,
   stem: "A 79-year-old woman is brought by her daughter after three falls over the past month.",
   finalDiagnosis: "Orthostatic hypotension from antihypertensive burden and dehydration",
   diagnosisAliases: ["postural hypotension", "orthostatic hypotension", "medication-related falls"],
   recording: [
    "She says the falls happen shortly after standing from bed or the lounge chair.",
    "She denies tripping but feels woozy and sometimes has dim vision before going down.",
    "Her GP recently increased blood pressure medication and she has been drinking less to avoid nocturia.",
    "Her daughter is worried she is losing confidence and has stopped walking to the shops."
   ],
   ddx: {
    must: [
     ddx("Orthostatic hypotension", "Postural prodrome after standing is the central pattern.", false, ["postural hypotension"]),
     ddx("Cardiac syncope or arrhythmia", "Falls without prodrome, exertional syncope or palpitations can be fatal.", true),
     ddx("Stroke or TIA", "New focal neurology, ataxia or visual symptoms must be excluded.", true)
    ],
    should: [
     ddx("Medication adverse effect", "Antihypertensives, sedatives and anticholinergics commonly contribute."),
     ddx("Mechanical falls and frailty", "Balance, vision, footwear and hazards matter."),
     ddx("Infection or delirium", "Older patients can fall as the first sign of acute illness.")
    ],
    bonus: [ddx("Parkinson disease", "Gait change, bradykinesia and autonomic dysfunction can cause falls.")]
   },
   history: [
    item("circumstances", "Circumstances before, during and after falls", "Occurs within a minute of standing; no prolonged confusion afterwards.", ["before", "during", "after", "standing", "postural", "recovery", "confusion"], 3, "Timing around posture separates orthostatic syncope from seizure and mechanical falls.", ["falls"], "hopc"),
    item("cardiac", "Chest pain, palpitations and exertional syncope", "No chest pain, palpitations or exertional collapse.", ["chest pain", "palpitations", "exertion", "syncope", "heart"], 3, "Cardiac syncope can be sudden because cerebral perfusion drops abruptly from rhythm or outflow problems.", ["cardiac", "falls"], "redflag"),
    item("neuro", "Neurological symptoms", "No weakness, dysarthria, diplopia, new headache or unilateral numbness.", ["weakness", "speech", "diplopia", "vision", "numbness", "headache", "neuro"], 3, "Posterior circulation and focal neurological events can present as falls or imbalance.", ["neuro"], "redflag"),
    item("meds", "Medication and alcohol review", "Perindopril/indapamide increased recently; temazepam twice weekly; no alcohol.", ["medications", "meds", "blood pressure tablets", "diuretic", "sedative", "temazepam", "alcohol"], 3, "Vasodilators, diuretics and sedatives reduce perfusion or alertness and raise falls risk.", ["meds"], "background"),
    item("hydration", "Fluid intake and intercurrent illness", "Drinks little fluid to avoid nocturia; no fever or diarrhoea.", ["hydration", "fluids", "dehydration", "nocturia", "diarrhoea", "fever"], 2, "Reduced intravascular volume worsens postural blood pressure drops.", ["vitals"], "associated"),
    item("function", "Function, fear of falling and hazards", "Stopped shopping alone; loose rug in hallway; wears multifocals.", ["function", "walking", "confidence", "hazards", "rug", "vision", "footwear"], 2, "Falls management is not just diagnosis; it prevents loss of independence.", ["falls"], "background")
   ],
   examination: [
    item("lying-standing", "Lying and standing blood pressure", "Lying BP 138/76 HR 74; standing BP 102/62 HR 88 with dizziness.", ["lying standing", "postural bp", "orthostatic", "blood pressure standing"], 3, "A postural BP drop demonstrates impaired compensation to gravity and volume shift.", ["vitals", "falls"], "exam", "cardiovascular"),
    item("cardiac", "Cardiac examination and pulse", "Regular pulse, no murmur, no heart failure signs.", ["pulse", "cardiac exam", "murmur", "heart failure", "jvp"], 2, "Murmur or irregular pulse would suggest structural or rhythm causes.", ["cardiac"], "exam", "cardiovascular"),
    item("neuro-gait", "Neurological and gait examination", "Normal power and sensation; cautious gait but no focal signs.", ["neuro exam", "gait", "power", "sensation", "ataxia", "balance"], 3, "Gait and focal neurology help separate frailty, neuropathy, stroke and Parkinsonism.", ["neuro", "falls"], "exam", "neurological"),
    item("injury", "Injury assessment", "Bruise over right hip, full range of motion, no head wound.", ["injury", "hip", "head strike", "bruise", "fracture"], 2, "Falls in older patients require active injury search, especially if anticoagulated.", ["falls"], "exam", "general")
   ],
   investigations: [
    ix("ecg", "ECG", "Sinus rhythm, no conduction block or ischaemic changes.", ["ecg", "arrhythmia", "heart block", "qt"], "bedside", 3, "ECG screens for arrhythmic causes that can be intermittent but dangerous.", ["cardiac"]),
    ix("bloods", "FBE, UEC, glucose, TSH, B12 if indicated", "Mild pre-renal dehydration pattern; Hb and glucose normal.", ["fbe", "uec", "electrolytes", "glucose", "tsh", "b12", "bloods"], "bloods", 2, "Anaemia, electrolyte disturbance, thyroid disease and hypoglycaemia can all cause falls.", ["bloods"]),
    ix("urine", "Urinalysis only if urinary or systemic features", "No urinary symptoms; dip not performed routinely.", ["urine", "urinalysis", "uti", "mcs"], "bedside", 1, "Avoid anchoring on asymptomatic bacteriuria; test urine when symptoms or delirium suggest infection.", ["urinary"]),
    ix("imaging", "Imaging if injury or focal neurology", "Hip X-ray not required clinically today; CT brain not indicated without head injury or neuro signs.", ["xray", "ct brain", "hip xray", "imaging"], "imaging", 1, "Imaging should answer a clinical question rather than substitute for falls assessment.", ["imaging"]),
    ix("holter", "Holter or event monitor if unexplained or recurrent syncope", "Not first-line today; consider if episodes continue after medication changes.", ["holter", "event monitor", "ambulatory ecg"], "special", 1, "Intermittent arrhythmias can be missed on a resting ECG.", ["cardiac"])
   ],
   management: [
    mx("med-review", "Medication review and reduce offending agents with prescriber oversight", ["medication review", "stop", "reduce", "antihypertensive", "sedative", "deprescribe"], 3, "Removing iatrogenic contributors treats the cause rather than only the consequence."),
    mx("hydration", "Hydration, slow position changes and compression advice if appropriate", ["hydration", "fluids", "stand slowly", "compression", "postural"], 2, "Increasing venous return and volume reduces postural cerebral hypoperfusion."),
    mx("falls-plan", "Falls prevention: physio strength and balance, vision, footwear and home hazards", ["physio", "strength", "balance", "vision", "footwear", "home safety", "falls prevention"], 3, "Multifactorial intervention reduces recurrence better than a single fix."),
    mx("follow-up", "Follow-up BP, symptoms and function soon", ["follow up", "review", "blood pressure", "function"], 1, "Overcorrection may cause hypertension; undercorrection leaves fall risk."),
    mx("safety", "Safety-net head injury, syncope, chest pain or new neurology", ["safety net", "head injury", "syncope", "chest pain", "neurology", "000"], 2, "These features point away from simple orthostasis and need urgent review.")
   ],
   doubleCheck: commonDoubleCheck
  },
  {
   id: "bowel-crc-007",
   title: "New Bowel Change",
   presentation: "Altered bowel habit",
   frameworkId: "bowel-habit",
   setting: "GP",
   difficulty: "easy",
   hidden: false,
   stem: "A 55-year-old woman reports eight weeks of alternating constipation and diarrhoea with intermittent rectal bleeding.",
   finalDiagnosis: "Colorectal cancer",
   diagnosisAliases: ["bowel cancer", "colon cancer", "rectal cancer", "colorectal carcinoma"],
   recording: [
    "She thought it was irritable bowel because stress at work has been high.",
    "The bleeding is mixed with stool rather than only on wiping.",
    "She has lower abdominal cramping and feels she never fully empties.",
    "Her mother had bowel cancer in her sixties."
   ],
   ddx: {
    must: [
     ddx("Colorectal cancer", "Age, new bowel habit change and bleeding are red flags.", true, ["bowel cancer"]),
     ddx("Inflammatory bowel disease", "Blood, urgency and diarrhoea can reflect mucosal inflammation.", false, ["IBD"]),
     ddx("Bowel obstruction", "Distension, vomiting and absolute constipation would be urgent.", true)
    ],
    should: [
     ddx("Haemorrhoids", "Common cause of bright bleeding, but does not explain all red flags."),
     ddx("Diverticular disease", "Can bleed or cause altered bowel symptoms."),
     ddx("Irritable bowel syndrome", "Should not be diagnosed with bleeding or older new-onset symptoms.")
    ],
    bonus: [ddx("Coeliac disease", "May cause diarrhoea and iron deficiency but bleeding is less typical.")]
   },
   history: [
    item("duration", "Duration and pattern of bowel change", "Eight weeks of alternating constipation and loose stool, with tenesmus.", ["duration", "bowel change", "constipation", "diarrhoea", "tenesmus", "empty"], 3, "New persistent bowel change suggests altered motility or partial luminal obstruction.", ["bowel"], "hopc"),
    item("bleeding", "Rectal bleeding character", "Dark red blood mixed with stool twice weekly.", ["blood", "bleeding", "rectal", "mixed", "stool", "melaena", "melena"], 3, "Blood mixed with stool is more concerning for proximal or mucosal pathology than wiping-only bleeding.", ["bowel"], "redflag"),
    item("weight-anaemia", "Weight loss and anaemia symptoms", "Lost 3 kg; mild fatigue but no chest pain or syncope.", ["weight loss", "fatigue", "breathless", "anaemia", "syncope"], 3, "Cancer-related bleeding and inflammation can cause iron deficiency and catabolic weight loss.", ["constitutional", "anaemia"], "redflag"),
    item("obstruction", "Obstructive symptoms", "No vomiting, abdominal distension or absolute constipation.", ["vomit", "distension", "absolute constipation", "obstruction", "flatus"], 3, "Obstruction implies threatened bowel viability and need for urgent surgical assessment.", ["abdominalPain", "bowel"], "redflag"),
    item("family-screening", "Family history and screening", "Mother had bowel cancer at 64; patient has not done a bowel screen.", ["family history", "screening", "fobt", "ifobt", "bowel screen", "colon cancer"], 2, "Family history and missed screening increase the need for definitive assessment.", ["bowel"], "background"),
    item("ibs-features", "IBS and inflammatory features", "No nocturnal diarrhoea, fever or extra-intestinal symptoms.", ["nocturnal", "fever", "joint", "rash", "eye", "mouth ulcers", "ibs"], 1, "Nocturnal symptoms and systemic features would support inflammatory disease over functional bowel disease.", ["bowel", "infection"], "associated")
   ],
   examination: [
    item("vitals", "Vitals and general appearance", "Vitals stable; appears mildly pale.", ["vitals", "pallor", "appearance", "weight"], 2, "Pallor supports chronic blood loss or anaemia.", ["anaemia"], "exam", "general"),
    item("abdo", "Abdominal examination", "Mild left lower quadrant tenderness, no distension or palpable mass.", ["abdominal exam", "mass", "distension", "tenderness"], 2, "A mass is often absent; distension would raise obstruction.", ["bowel"], "exam", "abdomen"),
    item("pr", "Digital rectal examination", "No haemorrhoids; no palpable rectal mass; stool trace blood.", ["pr", "rectal exam", "haemorrhoids", "mass", "blood"], 3, "PR can detect low rectal tumours but a normal exam does not exclude proximal cancer.", ["bowel"], "exam", "rectal"),
    item("nodes", "Lymph nodes and hepatomegaly", "No lymphadenopathy or hepatomegaly.", ["lymph", "nodes", "liver", "hepatomegaly"], 1, "Metastatic disease can present with nodes or liver enlargement.", ["constitutional"], "exam", "general")
   ],
   investigations: [
    ix("fbe-iron", "FBE and iron studies", "Hb 105, MCV 75, ferritin low.", ["fbe", "haemoglobin", "mcv", "ferritin", "iron"], "bloods", 3, "Iron deficiency supports chronic GI blood loss.", ["anaemia"]),
    ix("stool", "Stool tests if diarrhoea prominent", "No infective organism detected.", ["stool mcs", "stool culture", "faeces", "calprotectin"], "special", 1, "Infection and inflammation can mimic malignancy but do not replace colonoscopy in red flags.", ["bowel"]),
    ix("colonoscopy", "Colonoscopy with biopsy", "Sigmoid ulcerating lesion; biopsy shows adenocarcinoma.", ["colonoscopy", "biopsy", "scope", "sigmoidoscopy"], "special", 3, "Tissue diagnosis is required before definitive cancer treatment.", ["bowel"]),
    ix("ct", "CT staging", "CT shows local sigmoid disease and suspicious regional nodes, no liver metastases.", ["ct", "staging", "ct cap", "abdomen pelvis"], "imaging", 2, "Staging determines operability and oncology planning.", ["imaging"]),
    ix("cea", "Baseline CEA", "CEA elevated.", ["cea", "tumour marker", "tumor marker"], "bloods", 1, "CEA is not a screening test but can help track disease after diagnosis.", ["bloods"])
   ],
   management: [
    mx("urgent-referral", "Urgent colonoscopy or colorectal referral", ["urgent", "colonoscopy", "colorectal", "gastroenterology", "referral"], 3, "Red flags need definitive investigation, not IBS reassurance."),
    mx("anaemia", "Assess and manage anaemia", ["anaemia", "iron", "transfusion", "haemoglobin"], 2, "Optimising anaemia improves symptoms and procedural safety."),
    mx("mdt", "Cancer MDT, staging and treatment planning", ["mdt", "staging", "surgery", "oncology", "radiotherapy", "chemotherapy"], 2, "Treatment sequencing depends on site, stage and patient fitness."),
    mx("communication", "Sensitive explanation and support", ["explain", "support", "counselling", "family"], 1, "Cancer pathways are frightening; clarity reduces uncertainty and improves adherence."),
    mx("safety", "Safety-net obstruction, heavy bleeding or syncope", ["safety net", "obstruction", "vomiting", "bleeding", "syncope"], 2, "Obstruction or major bleeding can become an emergency before outpatient workup completes.")
   ],
   doubleCheck: commonDoubleCheck
  },
  {
   id: "constipation-parkinson-008",
   title: "Constipation That Was Not Just Diet",
   presentation: "Constipation",
   frameworkId: "constipation",
   setting: "GP",
   difficulty: "hard",
   hidden: true,
   stem: "A 68-year-old man presents with constipation and vague abdominal discomfort over six months.",
   finalDiagnosis: "Parkinson disease with autonomic constipation",
   diagnosisAliases: ["Parkinson disease", "Parkinson's", "parkinsonism", "PD"],
   recording: [
    "He opens by asking for a stronger laxative because fibre has not helped much.",
    "His wife says he has become slower, quieter and shuffles when tired.",
    "He has lost his sense of smell over several years and sometimes acts out dreams.",
    "He has no rectal bleeding or weight loss."
   ],
   ddx: {
    must: [
     ddx("Colorectal cancer or obstruction", "New constipation in older age requires red flag screening.", true),
     ddx("Parkinson disease", "Constipation can precede motor symptoms through autonomic dysfunction.", false, ["PD", "parkinsonism"]),
     ddx("Medication-induced constipation", "Anticholinergics, opioids and calcium channel blockers are common causes.")
    ],
    should: [
     ddx("Hypothyroidism", "Constipation, cold intolerance and coarse hair fit reduced metabolic activity."),
     ddx("Dietary or low fluid intake", "Common and modifiable but should not stop red flag screening."),
     ddx("Irritable bowel syndrome", "Longstanding pain related to stooling pattern can mimic constipation.")
    ],
    bonus: [ddx("Hypercalcaemia", "Constipation with thirst, renal stones or confusion would suggest it.")]
   },
   history: [
    item("bowel", "Constipation pattern and obstruction symptoms", "Bowels every 4-5 days, hard stool; still passing flatus, no vomiting or distension.", ["constipation", "bowel frequency", "hard stool", "flatus", "vomiting", "distension", "obstruction"], 3, "Vomiting, distension and no flatus imply obstruction rather than simple slow transit.", ["bowel"], "hopc"),
    item("cancer-redflags", "Rectal bleeding, weight loss and anaemia symptoms", "No bleeding, melaena, weight loss, fatigue or breathlessness.", ["blood", "rectal bleeding", "weight loss", "melaena", "anaemia", "fatigue"], 3, "These features would move bowel cancer up the differential.", ["bowel", "anaemia"], "redflag"),
    item("parkinson-motor", "Motor Parkinson symptoms", "Right hand rest tremor, smaller handwriting, shuffling gait and slowness.", ["tremor", "shuffling", "gait", "slow", "bradykinesia", "handwriting", "micrographia", "stiff"], 3, "Basal ganglia dopamine loss causes bradykinesia, rigidity and rest tremor.", ["neuro", "parkinson"], "associated"),
    item("nonmotor", "Non-motor Parkinson symptoms", "Anosmia and dream enactment; low mood at times.", ["anosmia", "smell", "rem sleep", "dreams", "acting dreams", "mood", "constipation"], 2, "Autonomic and sleep features often precede motor Parkinson disease.", ["parkinson", "mood"], "associated"),
    item("meds-thyroid", "Medication and endocrine screen", "No opioids or anticholinergics; no cold intolerance, dry skin or brittle hair.", ["medications", "opioid", "anticholinergic", "thyroid", "cold intolerance", "dry skin", "brittle hair"], 2, "Drugs and hypothyroidism reduce gut motility and are reversible causes.", ["meds", "thyroid"], "background"),
    item("diet", "Diet, fluid and mobility", "Low fluid intake and reduced walking since retiring.", ["diet", "fibre", "fiber", "fluid", "water", "exercise", "mobility"], 1, "Low intake and mobility worsen constipation but do not explain neurological signs.", ["bowel"], "background")
   ],
   examination: [
    item("abdo-pr", "Abdominal and PR examination", "Soft abdomen, no mass, empty rectum, no blood.", ["abdominal exam", "pr", "rectal", "mass", "blood", "faecal loading"], 3, "This screens for obstruction, mass and impaction.", ["bowel"], "exam", "abdomen"),
    item("neuro", "Neurological examination", "Right-sided rest tremor, cogwheel rigidity and bradykinesia; reduced arm swing.", ["neuro exam", "tremor", "rigidity", "bradykinesia", "arm swing", "cogwheel"], 3, "Asymmetric bradykinesia plus rigidity/tremor is typical of Parkinsonian syndromes.", ["neuro", "parkinson"], "exam", "neurological"),
    item("gait", "Gait and falls assessment", "Short-stepped gait, turns slowly, no postural instability yet.", ["gait", "falls", "postural instability", "turning", "shuffling"], 2, "Gait impairment affects function and safety even early.", ["falls", "parkinson"], "exam", "neurological"),
    item("thyroid", "Thyroid and general examination", "No goitre, normal reflex relaxation, no oedema.", ["thyroid exam", "goitre", "reflexes", "oedema", "dry skin"], 1, "Hypothyroidism can mimic slow movement and constipation.", ["thyroid"], "exam", "endocrine")
   ],
   investigations: [
    ix("bloods", "FBE, UEC, calcium, TSH", "FBE normal, calcium normal, TSH normal.", ["fbe", "uec", "calcium", "tsh", "bloods"], "bloods", 2, "Bloods screen reversible metabolic causes of constipation and fatigue.", ["bloods", "thyroid"]),
    ix("bowel-cancer", "Bowel cancer investigation if red flags or screening due", "NBCSP kit overdue; colonoscopy not urgent from symptoms but screening is discussed.", ["bowel screen", "fobt", "ifobt", "colonoscopy", "screening"], "special", 2, "Age-appropriate screening still matters even when another diagnosis is likely.", ["bowel"]),
    ix("imaging", "Brain imaging only if atypical features", "No immediate imaging; consider if rapid progression, early falls or focal signs.", ["mri brain", "ct brain", "imaging", "atypical"], "imaging", 1, "Parkinson disease is clinical; imaging is for atypical or alternative diagnoses.", ["neuro"]),
    ix("specialist", "Neurology referral", "Neurology review supports idiopathic Parkinson disease.", ["neurology", "specialist", "movement disorder"], "special", 3, "Specialist confirmation guides dopaminergic therapy and allied health planning.", ["neuro"]),
    ix("falls-function", "Functional assessment", "Timed up-and-go slightly slow; no major home hazards identified yet.", ["falls assessment", "timed up and go", "ot", "physio"], "bedside", 1, "Baseline function helps track progression and target therapy.", ["falls"])
   ],
   management: [
    mx("redflags", "Do not miss bowel red flags; arrange screening or colonoscopy if indicated", ["red flags", "bowel screening", "colonoscopy", "bleeding", "weight loss"], 2, "Hidden diagnoses are useful, but cancer safety remains first."),
    mx("neuro-referral", "Refer to neurology or movement disorder service", ["neurology", "movement disorder", "refer"], 3, "Diagnosis and treatment planning are clinical and longitudinal."),
    mx("constipation", "Constipation plan: fluids, fibre as tolerated, osmotic laxative and review", ["fluid", "fibre", "fiber", "laxative", "macrogol", "bowel regimen"], 2, "Autonomic slow transit often needs ongoing bowel regimen rather than diet alone."),
    mx("allied", "Physio, exercise, falls prevention and occupational therapy", ["physio", "exercise", "falls", "ot", "occupational"], 2, "Exercise and cueing strategies preserve function and reduce falls."),
    mx("education", "Education on Parkinson disease, driving/work issues and follow-up", ["education", "follow up", "driving", "support", "parkinson"], 1, "A chronic neurodegenerative diagnosis needs practical planning, not just medication.")
   ],
   doubleCheck: commonDoubleCheck
  },
  {
   id: "palp-thyroid-af-009",
   title: "Fluttering Heart And Weight Loss",
   presentation: "Palpitations",
   frameworkId: "palpitations",
   setting: "GP",
   difficulty: "medium",
   hidden: false,
   stem: "A 45-year-old woman attends with intermittent palpitations, tremor and unintentional weight loss.",
   finalDiagnosis: "Atrial fibrillation triggered by hyperthyroidism",
   diagnosisAliases: ["AF", "atrial fibrillation", "thyrotoxicosis", "hyperthyroidism", "Graves disease"],
   recording: [
    "Her heart feels irregular rather than just fast, lasting hours at a time.",
    "She has lost weight despite eating more and feels hot and sweaty.",
    "Her hands shake when holding a cup and she is opening her bowels more often.",
    "She has no chest pain but feels breathless climbing stairs."
   ],
   ddx: {
    must: [
     ddx("Atrial fibrillation", "Irregular palpitations with dyspnoea require ECG confirmation and stroke risk thinking.", true, ["AF"]),
     ddx("Hyperthyroidism", "Weight loss, heat intolerance, tremor and diarrhoea form a classic endocrine driver.", false, ["thyrotoxicosis"]),
     ddx("Acute coronary syndrome", "Chest pain or exertional symptoms with arrhythmia must be screened.", true)
    ],
    should: [
     ddx("Anaemia", "Can cause palpitations and dyspnoea through high-output physiology."),
     ddx("Panic attacks", "Can mimic palpitations but irregular pulse and thyroid features point elsewhere."),
     ddx("Stimulant or medication effect", "Caffeine, decongestants and thyroxine can trigger tachyarrhythmia.")
    ],
    bonus: [ddx("Phaeochromocytoma", "Episodic headache, sweating and hypertension would be the clue.")]
   },
   history: [
    item("palp", "Palpitation onset, rhythm and duration", "Episodes last hours; pulse feels irregular and fast.", ["palpitations", "flutter", "irregular", "fast", "duration", "onset"], 3, "Irregularly irregular symptoms suggest atrial fibrillation rather than sinus tachycardia.", ["cardiac"], "hopc"),
    item("danger", "Syncope, chest pain and dyspnoea", "No syncope or chest pain; mild exertional dyspnoea.", ["syncope", "chest pain", "shortness", "sob", "breathless", "dizzy"], 3, "These symptoms identify unstable arrhythmia, ischaemia or heart failure.", ["cardiac", "shortnessBreath"], "redflag"),
    item("thyroid", "Hyperthyroid symptoms", "Heat intolerance, sweating, tremor, diarrhoea and weight loss despite appetite.", ["heat", "sweat", "tremor", "diarrhoea", "weight loss", "appetite", "thyroid"], 3, "Excess thyroid hormone increases beta-adrenergic tone and cardiac automaticity.", ["thyroid"], "associated"),
    item("eyes-neck", "Eye and neck symptoms", "Gritty eyes and anterior neck fullness.", ["eyes", "gritty", "proptosis", "neck swelling", "goitre", "goiter"], 2, "Eye signs and goitre suggest Graves disease rather than thyroiditis alone.", ["thyroid"], "associated"),
    item("triggers", "Stimulants and medication", "High caffeine intake; no thyroxine, decongestants or illicit stimulants.", ["caffeine", "coffee", "energy drink", "thyroxine", "decongestant", "stimulant", "drugs"], 2, "Sympathomimetics can trigger palpitations and confound the picture.", ["meds"], "background"),
    item("stroke-risk", "Stroke risk factors", "No prior stroke, diabetes, hypertension or heart failure.", ["stroke", "tia", "diabetes", "hypertension", "heart failure", "risk factors"], 2, "AF risk assessment matters because atrial stasis can form embolic thrombus.", ["cardiac", "neuro"], "background")
   ],
   examination: [
    item("vitals-pulse", "Vitals and pulse character", "HR 136 irregularly irregular, BP 142/78, afebrile.", ["vitals", "pulse", "irregular", "heart rate", "blood pressure"], 3, "An irregularly irregular pulse is AF until ECG confirms otherwise.", ["vitals", "cardiac"], "exam", "cardiovascular"),
    item("thyroid-exam", "Thyroid examination", "Diffuse non-tender goitre with fine tremor and warm moist hands.", ["thyroid exam", "goitre", "tremor", "hands", "sweaty", "warm"], 3, "Peripheral adrenergic signs reflect increased metabolic and sympathetic activity.", ["thyroid"], "exam", "endocrine"),
    item("eyes", "Eye examination", "Mild lid lag, no visual compromise.", ["eyes", "lid lag", "proptosis", "visual", "ophthalmopathy"], 2, "Thyroid eye disease can threaten vision if severe.", ["thyroid"], "exam", "eyes"),
    item("heart-failure", "Cardiac failure signs", "No basal crackles, oedema or raised JVP.", ["heart failure", "jvp", "oedema", "crackles", "lungs"], 2, "Fast AF can precipitate tachycardia-mediated cardiomyopathy and congestion.", ["cardiac"], "exam", "cardiovascular")
   ],
   investigations: [
    ix("ecg", "ECG", "Atrial fibrillation with ventricular rate around 135 bpm.", ["ecg", "atrial fibrillation", "af", "rhythm strip"], "bedside", 3, "ECG confirms rhythm and rate, guiding urgency and therapy.", ["cardiac"]),
    ix("thyroid", "TSH, free T4 and T3", "TSH suppressed, free T4 and T3 elevated.", ["tsh", "t4", "t3", "thyroid function", "tfts"], "bloods", 3, "Biochemistry confirms thyrotoxicosis and severity.", ["thyroid"]),
    ix("bloods", "FBE, UEC, LFT and electrolytes", "FBE normal, potassium normal, LFT mildly abnormal.", ["fbe", "uec", "electrolytes", "lft", "magnesium", "bloods"], "bloods", 2, "Electrolytes and organ function affect arrhythmia risk and medication choices.", ["bloods"]),
    ix("antibodies", "TSH receptor antibodies", "Positive.", ["trab", "tsh receptor antibody", "thyroid antibodies"], "special", 1, "Antibodies support Graves disease as the cause.", ["thyroid"]),
    ix("echo", "Echocardiogram if persistent AF or symptoms", "Normal LV function, no significant valvular disease.", ["echo", "echocardiogram", "heart ultrasound"], "imaging", 1, "Echo assesses structural disease and consequences of tachyarrhythmia.", ["cardiac"])
   ],
   management: [
    mx("rate", "Rate control and assess stability urgently", ["rate control", "beta blocker", "propranolol", "metoprolol", "stable", "unstable"], 3, "Slowing ventricular response improves filling and symptoms; unstable patients need emergency care."),
    mx("thyroid", "Treat hyperthyroidism with endocrine or specialist guidance", ["antithyroid", "carbimazole", "endocrine", "thyroid treatment"], 3, "Treating the driver reduces recurrent AF and systemic complications."),
    mx("stroke", "Assess stroke risk and anticoagulation need", ["anticoagulation", "cha2ds2", "stroke risk", "blood thinner"], 2, "AF can form left atrial thrombus even when triggered by reversible illness."),
    mx("safety", "Safety-net chest pain, syncope, severe breathlessness or visual symptoms", ["safety net", "chest pain", "syncope", "breathless", "vision", "000"], 2, "These suggest unstable arrhythmia, heart failure or thyroid eye emergency."),
    mx("avoid", "Reduce stimulants and review medications", ["caffeine", "stimulants", "medication review", "decongestant"], 1, "Lowering adrenergic triggers helps symptom control.")
   ],
   doubleCheck: commonDoubleCheck
  },
  {
   id: "back-cauda-010",
   title: "Back Pain With New Bladder Trouble",
   presentation: "Back pain",
   frameworkId: "back-pain",
   setting: "ED",
   difficulty: "easy",
   hidden: false,
   stem: "A 42-year-old warehouse worker presents with severe lower back pain radiating down both legs.",
   finalDiagnosis: "Cauda equina syndrome from large lumbar disc prolapse",
   diagnosisAliases: ["cauda equina", "CES", "disc prolapse", "lumbar disc herniation"],
   recording: [
    "He lifted a heavy box two days ago and developed back pain that is now bilateral.",
    "This morning he struggled to start urinating and felt numb wiping after opening his bowels.",
    "He has tingling down both legs and feels his left foot is weaker.",
    "He has no fever, cancer history or IV drug use."
   ],
   ddx: {
    must: [
     ddx("Cauda equina syndrome", "Bladder dysfunction and saddle sensory change are neurosurgical red flags.", true, ["CES"]),
     ddx("Spinal infection", "Fever, IVDU or immunosuppression with back pain can be catastrophic.", true),
     ddx("Malignancy or fracture", "Cancer, trauma or steroid exposure changes imaging urgency.", true)
    ],
    should: [
     ddx("Lumbar radiculopathy", "Leg pain in a dermatomal pattern without bladder features."),
     ddx("Non-specific mechanical back pain", "Common but only after red flags are excluded."),
     ddx("Renal colic", "Flank radiation and urinary symptoms can mimic back pain.")
    ],
    bonus: [ddx("Inflammatory back pain", "Morning stiffness and improvement with exercise suggest spondyloarthritis.")]
   },
   history: [
    item("bladder", "Bladder dysfunction", "New urinary hesitancy and reduced sensation of bladder fullness.", ["urinary retention", "hesitancy", "bladder", "incontinence", "can't pee", "cannot pee"], 3, "Sacral nerve root compression impairs detrusor and sphincter control.", ["backPain", "neuro", "urinary"], "redflag"),
    item("saddle", "Saddle anaesthesia and bowel function", "Numb around perineum when wiping; no faecal incontinence.", ["saddle", "perineal", "numb wiping", "bowel incontinence", "anal sensation"], 3, "S2-S4 sensory loss is a hallmark of cauda equina compression.", ["backPain", "neuro"], "redflag"),
    item("legs", "Bilateral sciatica, weakness and numbness", "Pain down both posterior legs; left foot feels weak.", ["bilateral", "sciatica", "leg pain", "weakness", "numbness", "foot drop"], 3, "Bilateral root involvement and motor deficit imply central canal compromise.", ["backPain", "neuro"], "hopc"),
    item("infection", "Infection risks", "No fever, IVDU, recent spinal procedure or immunosuppression.", ["fever", "ivdu", "immunosuppression", "spinal injection", "infection"], 2, "Spinal epidural abscess can compress neural structures and needs urgent treatment.", ["infection", "backPain"], "redflag"),
    item("cancer-fracture", "Cancer, trauma and steroid risks", "No cancer, weight loss, major trauma or long-term steroids.", ["cancer", "weight loss", "trauma", "steroids", "osteoporosis"], 2, "Malignancy and fracture are uncommon but serious causes needing imaging.", ["constitutional", "backPain"], "redflag"),
    item("pain", "Pain onset and mechanical features", "Started after lifting, worse with coughing and sitting.", ["onset", "lifting", "cough", "sitting", "mechanical", "pain"], 1, "Disc prolapse pain often worsens with increased intraspinal pressure.", ["backPain"], "hopc")
   ],
   examination: [
    item("neuro-leg", "Lower limb neurological examination", "Left ankle dorsiflexion 4/5, reduced S1 reflexes bilaterally.", ["power", "reflexes", "sensation", "lower limb neuro", "dorsiflexion"], 3, "Motor and reflex deficits localise nerve root involvement.", ["neuro", "backPain"], "exam", "neurological"),
    item("saddle-exam", "Perianal sensation and anal tone", "Reduced perianal pinprick; reduced anal tone.", ["anal tone", "perianal", "saddle sensation", "rectal tone"], 3, "Objective sacral dysfunction supports cauda equina syndrome.", ["neuro", "backPain"], "exam", "neurological"),
    item("bladder-scan", "Post-void residual bladder scan", "Post-void residual 520 mL.", ["bladder scan", "post void", "residual", "urine retention"], 3, "Retention confirms autonomic bladder dysfunction from sacral root compression.", ["urinary"], "exam", "bedside"),
    item("spine", "Spine and systemic examination", "Lumbar tenderness, no fever, no skin infection.", ["spine exam", "tenderness", "temperature", "skin", "fever"], 1, "Systemic signs would raise infection or malignancy.", ["backPain"], "exam", "musculoskeletal")
   ],
   investigations: [
    ix("mri", "Urgent MRI lumbar spine", "Large central L4/5 disc prolapse compressing cauda equina.", ["mri", "lumbar mri", "spine mri", "urgent imaging"], "imaging", 3, "MRI visualises neural compression and guides surgical decompression.", ["imaging", "backPain"]),
    ix("bloods", "FBE, CRP, UEC and coagulation", "CRP normal, FBE normal, renal function normal.", ["fbe", "crp", "uec", "coag", "bloods"], "bloods", 1, "Bloods screen infection and prepare for surgery, but must not delay MRI.", ["bloods"]),
    ix("urine", "Urinary assessment", "Urinalysis negative; retention is neurological, not UTI.", ["urine", "urinalysis", "uti"], "bedside", 1, "A UTI label can dangerously distract from neurological retention.", ["urinary"]),
    ix("xray", "Plain X-ray only if fracture suspected", "Not useful for the current compressive syndrome.", ["xray", "plain film", "ct"], "imaging", 1, "Plain films do not adequately assess cauda equina compression.", ["imaging"]),
    ix("neurosurg", "Urgent neurosurgical review", "Neurosurgery accepts for decompression pathway.", ["neurosurgery", "orthopaedics", "spine team", "surgical review"], "special", 3, "Definitive management is time-critical decompression when cauda equina is confirmed.", ["backPain"])
   ],
   management: [
    mx("urgent", "Immediate ED/spinal surgical escalation", ["urgent", "ed", "neurosurgery", "spinal", "surgical", "decompression"], 3, "Delayed decompression risks permanent bladder, bowel and sexual dysfunction."),
    mx("do-not-delay", "Do not delay referral by arranging outpatient imaging", ["do not delay", "same day", "emergency", "outpatient"], 3, "Clinical suspicion alone warrants emergency referral."),
    mx("analgesia", "Analgesia, bladder care and nil-by-mouth if surgery likely", ["analgesia", "pain relief", "catheter", "bladder", "nil by mouth"], 2, "Supportive care prevents retention complications and prepares for surgery."),
    mx("document", "Document neurological deficits and timing", ["document", "time", "neuro findings", "baseline"], 1, "Baseline deficits matter for surgical triage and recovery tracking."),
    mx("safety", "Explain red flags and urgency clearly", ["explain", "red flags", "urgent", "safety"], 1, "Patients may underestimate back pain red flags without explicit explanation.")
   ],
   doubleCheck: [
    "RACGP guidance stresses ED referral for suspected cauda equina rather than delaying for outpatient imaging.",
    ...commonDoubleCheck
   ]
  },
  {
   id: "fever-pyelo-sepsis-011",
   title: "Rigors And Flank Pain",
   presentation: "Fever",
   frameworkId: "fever",
   setting: "GP",
   difficulty: "medium",
   hidden: false,
   stem: "A 71-year-old woman presents to a GP clinic with rigors, fever and right flank pain.",
   finalDiagnosis: "Pyelonephritis with sepsis risk",
   diagnosisAliases: ["pyelonephritis", "urosepsis", "sepsis", "kidney infection"],
   recording: [
    "She has had dysuria for three days, then developed fever and shaking chills overnight.",
    "She looks washed out and her daughter says she is more confused than usual.",
    "She has type 2 diabetes and chronic kidney disease.",
    "She asks for oral antibiotics so she can go home."
   ],
   ddx: {
    must: [
     ddx("Pyelonephritis or urosepsis", "Fever, rigors, flank pain and urinary symptoms form the core diagnosis.", true, ["urosepsis"]),
     ddx("Sepsis from another source", "Older patients can have unclear source and rapid deterioration.", true),
     ddx("Obstructed infected kidney stone", "Flank pain plus sepsis may need urgent source control.", true)
    ],
    should: [
     ddx("Pneumonia", "Older patients may present with confusion and fever without cough."),
     ddx("Cholecystitis", "Right-sided pain and fever can be biliary."),
     ddx("Viral illness", "Less likely with flank pain and urinary symptoms.")
    ],
    bonus: [ddx("Renal abscess", "Persistent fever despite antibiotics would raise this.")]
   },
   history: [
    item("urinary", "Urinary symptoms", "Dysuria, frequency and cloudy urine for three days.", ["dysuria", "frequency", "urgency", "cloudy", "urine", "uti"], 3, "Ascending urinary infection can reach renal parenchyma and bloodstream.", ["urinary", "infection"], "hopc"),
    item("systemic", "Fever, rigors and deterioration", "Rigors overnight, feels very unwell, daughter reports confusion.", ["fever", "rigors", "chills", "confusion", "delirium", "very unwell"], 3, "Rigors and delirium suggest bacteraemia and organ dysfunction risk.", ["infection", "vitals"], "redflag"),
    item("flank", "Flank pain and renal colic symptoms", "Right flank ache, no colicky waves or haematuria noticed.", ["flank", "loin", "renal colic", "haematuria", "stone"], 3, "Obstruction plus infection needs urgent drainage because antibiotics may not penetrate an obstructed system.", ["urinary", "abdominalPain"], "redflag"),
    item("risk", "Comorbidities and immunosuppression", "Type 2 diabetes, CKD stage 3, no chemotherapy or steroids.", ["diabetes", "ckd", "kidney disease", "immunosuppression", "chemo", "steroids"], 2, "Diabetes and CKD increase infection severity and antimicrobial complexity.", ["infection", "diabetes"], "background"),
    item("sepsis-output", "Hydration and urine output", "Reduced oral intake and passed little urine today.", ["urine output", "oliguria", "dehydration", "fluids", "oral intake"], 3, "Low urine output can indicate hypoperfusion and kidney injury in sepsis.", ["vitals", "urinary"], "redflag"),
    item("allergy-resistance", "Antibiotic allergy and resistant organism risk", "No allergies; hospitalised for UTI six months ago.", ["allergy", "antibiotic", "resistance", "hospital", "previous uti"], 2, "Prior healthcare exposure changes resistant organism risk and empiric choices.", ["meds", "infection"], "background")
   ],
   examination: [
    item("vitals", "Full vital signs", "Temp 39.1, HR 118, BP 94/58, RR 24, SpO2 95% RA.", ["vitals", "temperature", "heart rate", "blood pressure", "respiratory rate", "sepsis"], 3, "Hypotension and tachypnoea indicate infection-related organ dysfunction risk.", ["vitals", "infection"], "exam", "general"),
    item("mental", "Mental state and perfusion", "Mildly confused, cool peripheries, capillary refill 4 seconds.", ["mental state", "confusion", "perfusion", "capillary refill", "cool"], 3, "Altered mentation and poor perfusion are sepsis red flags.", ["vitals", "neuro"], "exam", "general"),
    item("renal", "Renal angle and abdominal examination", "Right renal angle tenderness, soft abdomen, no guarding.", ["renal angle", "cva tenderness", "flank", "abdominal exam", "guarding"], 2, "Renal angle tenderness localises infection to upper urinary tract.", ["urinary"], "exam", "abdomen"),
    item("other-source", "Chest, skin and calves", "Chest clear, no cellulitis, no meningism.", ["chest", "skin", "cellulitis", "meningism", "source"], 1, "Sepsis assessment still needs alternate source search.", ["infection"], "exam", "general")
   ],
   investigations: [
    ix("urine-dip", "Urine dip and culture", "Leukocytes and nitrites positive; urine culture sent.", ["urine dip", "mcs", "culture", "leukocytes", "nitrites"], "bedside", 3, "Culture identifies organism and sensitivities, ideally before antibiotics if it does not delay treatment.", ["urinary", "infection"]),
    ix("lactate", "Venous blood gas and lactate", "Lactate 3.1 mmol/L.", ["lactate", "vbg", "blood gas", "venous gas"], "bloods", 3, "Raised lactate can signal tissue hypoperfusion in sepsis.", ["infection", "bloods"]),
    ix("blood-cultures", "Blood cultures and sepsis bloods", "Blood cultures sent; WCC 18, CRP 210, creatinine above baseline.", ["blood cultures", "fbe", "crp", "uec", "creatinine", "bloods"], "bloods", 3, "Cultures guide therapy, while renal injury is organ dysfunction.", ["infection", "bloods"]),
    ix("imaging", "Renal tract imaging if obstruction suspected", "CT KUB later shows no obstructing stone.", ["renal ultrasound", "ct kub", "obstruction", "stone", "imaging"], "imaging", 2, "Infected obstruction needs source control, not antibiotics alone.", ["urinary", "imaging"]),
    ix("ecg", "ECG if tachycardic or older unwell patient", "Sinus tachycardia.", ["ecg", "tachycardia", "arrhythmia"], "bedside", 1, "Sepsis stress and electrolyte changes can provoke arrhythmias.", ["cardiac"])
   ],
   management: [
    mx("transfer", "Immediate ambulance transfer or ED escalation for sepsis risk", ["ambulance", "ed", "hospital", "urgent", "sepsis", "transfer"], 3, "Sepsis is time-critical and unsafe for routine outpatient care."),
    mx("sepsis", "Activate local sepsis pathway: fluids, cultures, antibiotics without delay", ["sepsis pathway", "fluids", "blood cultures", "antibiotics", "lactate"], 3, "Early resuscitation and antimicrobials reduce progression to shock."),
    mx("source", "Look for obstructed infected stone and need for source control", ["obstruction", "stone", "source control", "urology"], 2, "Antibiotics cannot reliably sterilise an obstructed infected collecting system."),
    mx("renal", "Dose-adjust medications and monitor renal function", ["renal", "ckd", "dose adjust", "kidney", "nephrotoxic"], 1, "AKI and CKD affect antibiotic safety and fluid balance."),
    mx("safety", "Explain why home oral antibiotics are unsafe today", ["explain", "unsafe", "safety", "deterioration"], 1, "Patient preference must be addressed without minimising risk.")
   ],
   doubleCheck: commonDoubleCheck
  },
  {
   id: "dizzy-stroke-012",
   title: "Dizzy And Cannot Walk Straight",
   presentation: "Dizziness",
   frameworkId: "dizziness",
   setting: "ED",
   difficulty: "hard",
   hidden: true,
   stem: "A 63-year-old man presents with sudden dizziness, vomiting and inability to walk straight.",
   finalDiagnosis: "Posterior circulation stroke",
   diagnosisAliases: ["cerebellar stroke", "posterior stroke", "vertebrobasilar stroke", "stroke"],
   recording: [
    "He describes constant spinning that started suddenly while gardening.",
    "He vomited repeatedly and cannot walk without holding the wall.",
    "He has hypertension, type 2 diabetes and smokes.",
    "He thinks it might be an inner ear problem because a friend had vertigo last year."
   ],
   ddx: {
    must: [
     ddx("Posterior circulation stroke", "Acute continuous vertigo with ataxia and vascular risks is a classic trap.", true),
     ddx("Intracranial haemorrhage", "Severe headache, vomiting or neuro deficit could reflect bleeding.", true),
     ddx("Vestibular neuritis", "Common peripheral mimic but should not be assumed with red flags.")
    ],
    should: [
     ddx("BPPV", "Brief position-triggered episodes, not continuous inability to walk."),
     ddx("Meniere disease", "Vertigo with fluctuating hearing loss and tinnitus."),
     ddx("Hypoglycaemia or metabolic cause", "Always check glucose in acute neurological symptoms.")
    ],
    bonus: [ddx("Migraine with brainstem aura", "Can mimic posterior circulation symptoms but needs careful diagnosis.")]
   },
   history: [
    item("define", "Define dizziness and time course", "Continuous spinning vertigo, sudden onset, not brief positional episodes.", ["dizziness", "vertigo", "spinning", "continuous", "sudden", "positional"], 3, "Continuous acute vestibular syndrome can be peripheral or central; timing matters more than the word dizziness.", ["dizziness"], "hopc"),
    item("ataxia", "Gait inability and coordination", "Cannot walk unaided and veers right.", ["walk", "ataxia", "balance", "coordination", "falls", "unsteady"], 3, "Severe truncal ataxia points to cerebellar or brainstem pathology.", ["neuro", "falls"], "redflag"),
    item("neuro", "Posterior circulation symptoms", "New double vision and slurred speech when tired; no limb weakness.", ["diplopia", "double vision", "dysarthria", "speech", "swallow", "weakness", "numbness"], 3, "Brainstem ischemia can affect cranial nerves, speech and swallowing.", ["neuro"], "redflag"),
    item("hearing", "Hearing symptoms", "No hearing loss, tinnitus or ear pain.", ["hearing", "tinnitus", "ear pain", "deaf", "aural"], 1, "Auditory symptoms support peripheral labyrinthine causes, though not perfectly.", ["dizziness"], "associated"),
    item("headache", "Headache and neck pain", "Mild occipital headache, no trauma.", ["headache", "occipital", "neck pain", "trauma", "dissection"], 2, "Occipital headache can accompany posterior fossa stroke or dissection.", ["headache", "neuro"], "redflag"),
    item("vascular", "Vascular risk factors and anticoagulation", "Hypertension, diabetes, smoker; not anticoagulated.", ["hypertension", "diabetes", "smoking", "cholesterol", "anticoagulant", "af"], 2, "Vascular risks increase pre-test probability of stroke.", ["cardiac", "neuro"], "background")
   ],
   examination: [
    item("vitals-glucose", "Vitals and bedside glucose", "BP 178/94, HR 88, glucose 9.8, afebrile.", ["vitals", "blood pressure", "glucose", "temperature"], 2, "Hypoglycaemia is a reversible mimic; hypertension is common in acute stroke.", ["vitals", "diabetes"], "exam", "general"),
    item("neuro", "Full neurological examination", "Dysarthria, right limb dysmetria and horizontal nystagmus.", ["neuro exam", "dysarthria", "nystagmus", "dysmetria", "cranial nerves"], 3, "Cerebellar signs and dysarthria localise centrally.", ["neuro"], "exam", "neurological"),
    item("gait", "Gait assessment if safe", "Unable to stand unaided without falling right.", ["gait", "stand", "walk", "romberg", "ataxia"], 3, "Inability to sit or stand unaided is a high-risk central sign.", ["falls", "neuro"], "exam", "neurological"),
    item("hints", "Eye movement assessment by trained clinician", "HINTS concerning for central cause.", ["hints", "head impulse", "skew", "nystagmus"], 2, "HINTS can help only when performed correctly in acute vestibular syndrome.", ["neuro"], "exam", "eyes")
   ],
   investigations: [
    ix("stroke-call", "Stroke pathway activation", "Stroke team review arranged urgently.", ["stroke call", "stroke pathway", "code stroke", "stroke team"], "special", 3, "Posterior strokes are time-critical and often missed.", ["neuro"]),
    ix("ct", "CT brain and CT angiography", "No bleed; CTA shows right vertebral artery occlusion.", ["ct brain", "ct angiogram", "cta", "vessel imaging"], "imaging", 3, "CT excludes haemorrhage; vascular imaging identifies large-vessel pathology.", ["imaging", "neuro"]),
    ix("mri", "MRI brain if CT non-diagnostic and suspicion remains", "MRI confirms acute right cerebellar infarct.", ["mri", "dwi", "posterior fossa", "brain mri"], "imaging", 2, "Early CT can miss posterior fossa ischemia; MRI is more sensitive.", ["imaging", "neuro"]),
    ix("ecg", "ECG and telemetry", "Sinus rhythm initially.", ["ecg", "telemetry", "af", "arrhythmia"], "bedside", 2, "AF is a common embolic source and may be paroxysmal.", ["cardiac"]),
    ix("bloods", "FBE, UEC, coagulation, glucose and lipids", "No contraindication apparent on initial bloods.", ["fbe", "uec", "coag", "inr", "glucose", "lipids", "bloods"], "bloods", 2, "Thrombolysis or antithrombotic decisions require bleeding and metabolic checks.", ["bloods"])
   ],
   management: [
    mx("urgent", "Urgent stroke unit or ED management", ["urgent", "stroke unit", "ed", "hospital", "stroke team"], 3, "Posterior stroke can deteriorate from swelling, hydrocephalus or brainstem involvement."),
    mx("reperfusion", "Assess eligibility for reperfusion therapy", ["thrombolysis", "thrombectomy", "reperfusion", "time onset"], 3, "Time from onset and imaging determine whether reperfusion can salvage brain tissue."),
    mx("swallow", "Swallow screen, aspiration precautions and VTE prevention", ["swallow", "aspiration", "vte", "dvt prophylaxis"], 2, "Brainstem and cerebellar strokes can impair swallow and mobility."),
    mx("risk", "Secondary prevention: antithrombotic plan, BP, lipids, diabetes and smoking", ["antiplatelet", "statin", "blood pressure", "diabetes", "smoking", "secondary prevention"], 2, "Secondary prevention targets recurrent vascular events."),
    mx("rehab", "Early allied health rehabilitation", ["physio", "ot", "speech", "rehab"], 1, "Rehab addresses balance, speech, swallowing and independence.")
   ],
   doubleCheck: commonDoubleCheck
  },
  {
   id: "cough-pneumonia-013",
   title: "Cough With Pleuritic Pain",
   presentation: "Shortness of breath",
   frameworkId: "shortness-breath",
   setting: "GP",
   difficulty: "easy",
   hidden: false,
   stem: "A 66-year-old man presents with cough, fever and increasing shortness of breath over four days.",
   finalDiagnosis: "Community-acquired pneumonia",
   diagnosisAliases: ["pneumonia", "CAP", "lower respiratory tract infection"],
   recording: [
    "He has green sputum, rigors and right-sided pleuritic pain.",
    "His wife says he is more breathless walking to the bathroom.",
    "He has COPD and still smokes.",
    "He asks whether he just needs a stronger cough syrup."
   ],
   ddx: {
    must: [
     ddx("Community-acquired pneumonia", "Fever, productive cough and focal chest signs fit infection.", false, ["CAP"]),
     ddx("Sepsis", "Older patient with pneumonia can deteriorate quickly.", true),
     ddx("Pulmonary embolism", "Pleuritic pain and dyspnoea overlap with pneumonia.", true)
    ],
    should: [
     ddx("COPD exacerbation", "Wheeze, sputum and infective trigger can overlap."),
     ddx("Heart failure", "Dyspnoea and crackles may be cardiac rather than infective."),
     ddx("Lung cancer", "Smoking and recurrent or non-resolving pneumonia raise concern.")
    ],
    bonus: [ddx("COVID or influenza", "Respiratory viruses can cause primary illness or secondary pneumonia.")]
   },
   history: [
    item("resp", "Cough, sputum and pleuritic pain", "Productive green sputum and right pleuritic pain.", ["cough", "sputum", "phlegm", "pleuritic", "chest pain"], 3, "Inflamed infected alveoli and pleura produce sputum and pleuritic pain.", ["resp", "infection"], "hopc"),
    item("systemic", "Fever, rigors and sepsis symptoms", "Rigors, fever, reduced intake, no confusion.", ["fever", "rigors", "chills", "confusion", "reduced intake"], 3, "Systemic inflammatory response can progress to sepsis, especially in older adults.", ["infection"], "redflag"),
    item("dyspnoea", "Breathlessness severity and baseline", "Breathless walking to bathroom; normally walks to shops slowly.", ["shortness", "sob", "breathless", "baseline", "exercise tolerance"], 3, "Change from baseline helps grade severity and disposition.", ["shortnessBreath"], "hopc"),
    item("pe-cardiac", "PE and cardiac screen", "No calf swelling, haemoptysis, orthopnoea or leg oedema.", ["calf", "dvt", "haemoptysis", "orthopnoea", "oedema", "heart failure"], 2, "Dangerous mimics share dyspnoea and chest pain.", ["vte", "cardiac"], "redflag"),
    item("risk", "Comorbidities and immune risk", "COPD, smoker, no chemotherapy, no recent hospitalisation.", ["copd", "smoking", "immunosuppression", "hospital", "aged care"], 2, "Comorbid lung disease reduces respiratory reserve and changes pathogen risk.", ["resp", "infection"], "background"),
    item("vaccination", "Vaccination and exposure", "Influenza vaccine missed this year; no known COVID contacts.", ["vaccination", "flu", "influenza", "covid", "exposure"], 1, "Vaccination and exposure history informs prevention and testing.", ["infection"], "background")
   ],
   examination: [
    item("vitals", "Vitals and oxygenation", "Temp 38.7, HR 106, RR 24, BP 118/70, SpO2 92% RA.", ["vitals", "temperature", "oxygen", "spo2", "respiratory rate", "blood pressure"], 3, "Hypoxaemia and tachypnoea are severity markers in pneumonia.", ["vitals", "shortnessBreath"], "exam", "general"),
    item("chest", "Respiratory examination", "Right basal crackles and bronchial breath sounds; mild expiratory wheeze.", ["respiratory exam", "crackles", "bronchial", "wheeze", "air entry"], 3, "Consolidated lung transmits bronchial sounds and causes focal crackles.", ["resp", "infection"], "exam", "respiratory"),
    item("sepsis", "Perfusion and mental state", "Alert, warm peripheries, capillary refill 2 seconds.", ["mental state", "perfusion", "capillary refill", "confusion"], 2, "Sepsis assessment needs organ perfusion, not just temperature.", ["infection", "vitals"], "exam", "general"),
    item("cardiac", "Cardiac and fluid status", "No raised JVP or peripheral oedema.", ["jvp", "oedema", "heart failure", "cardiac"], 1, "Heart failure can mimic pneumonia and alter fluid decisions.", ["cardiac"], "exam", "cardiovascular")
   ],
   investigations: [
    ix("sats", "Pulse oximetry and severity scoring", "SpO2 92% on room air; severity suggests ED assessment.", ["sats", "spo2", "oxygen", "severity", "curb"], "bedside", 3, "Severity tools support but do not replace clinical judgement about admission.", ["shortnessBreath"]),
    ix("cxr", "Chest X-ray", "Right lower lobe consolidation.", ["cxr", "chest xray", "x ray", "consolidation"], "imaging", 3, "CXR confirms consolidation and screens for complications or malignancy.", ["imaging", "resp"]),
    ix("bloods", "FBE, UEC, CRP and blood cultures if severe", "WCC 15, CRP 160, renal function near baseline.", ["fbe", "uec", "crp", "blood cultures", "bloods"], "bloods", 2, "Inflammatory markers and renal function help severity and antibiotic planning.", ["bloods", "infection"]),
    ix("viral", "COVID and influenza testing", "COVID negative, influenza negative.", ["covid", "influenza", "pcr", "viral swab"], "special", 1, "Respiratory viruses change infection control and treatment decisions.", ["infection"]),
    ix("sputum", "Sputum culture if admitted or severe", "Sputum culture pending.", ["sputum culture", "mcs", "microbiology"], "special", 1, "Culture can guide therapy in severe or non-responding infection.", ["infection"])
   ],
   management: [
    mx("disposition", "Disposition based on severity, oxygenation and comorbidity", ["admit", "ed", "hospital", "disposition", "severity"], 3, "Hypoxaemia and COPD lower the threshold for ED care."),
    mx("antibiotics", "Antibiotics per local CAP guidance", ["antibiotics", "cap", "amoxicillin", "doxycycline", "local guideline"], 3, "Antibiotics target bacterial alveolar infection; choice depends on severity and local guidance."),
    mx("support", "Oxygen if required, fluids carefully, analgesia and bronchodilator if wheezy", ["oxygen", "fluids", "analgesia", "bronchodilator", "salbutamol"], 2, "Supportive care treats impaired gas exchange and pleuritic pain."),
    mx("smoking-vax", "Smoking cessation and vaccination follow-up", ["smoking", "quit", "vaccination", "flu vaccine", "pneumococcal"], 1, "Prevention reduces recurrence and COPD decline."),
    mx("safety", "Safety-net worsening breathlessness, confusion, fever or inability to drink", ["safety net", "worsening", "confusion", "fever", "drink", "000"], 2, "Pneumonia can worsen after initial review, especially in older patients.")
   ],
   doubleCheck: commonDoubleCheck
  },
  {
   id: "polyuria-diabetes-014",
   title: "Always Thirsty",
   presentation: "Polyuria and thirst",
   frameworkId: "diabetes",
   setting: "GP",
   difficulty: "medium",
   hidden: false,
   stem: "A 49-year-old man presents with thirst, frequent urination and blurred vision.",
   finalDiagnosis: "New type 2 diabetes mellitus",
   diagnosisAliases: ["type 2 diabetes", "T2DM", "diabetes", "hyperglycaemia"],
   recording: [
    "He wakes three times nightly to urinate and drinks water constantly.",
    "He has lost 4 kg despite no diet change and feels tired after meals.",
    "His father has type 2 diabetes and he has central obesity.",
    "He has no vomiting, abdominal pain or drowsiness."
   ],
   ddx: {
    must: [
     ddx("Type 2 diabetes mellitus", "Polyuria, polydipsia and blurred vision are classic hyperglycaemia symptoms.", false, ["T2DM"]),
     ddx("Hyperglycaemic emergency", "Vomiting, dehydration, ketosis or altered mental state would be dangerous.", true, ["DKA", "HHS"]),
     ddx("Type 1 diabetes or LADA", "Weight loss and ketosis features would change urgency and treatment.", true)
    ],
    should: [
     ddx("Diabetes insipidus", "Polyuria with dilute urine and normal glucose."),
     ddx("UTI", "Frequency can be infective, especially with dysuria."),
     ddx("Medication-induced hyperglycaemia", "Steroids and antipsychotics can trigger diabetes.")
    ],
    bonus: [ddx("Hypercalcaemia", "Thirst, constipation, stones and confusion would be clues.")]
   },
   history: [
    item("osmotic", "Polyuria, polydipsia and nocturia", "Marked thirst, nocturia three times nightly and high urine volume.", ["polyuria", "polydipsia", "thirst", "nocturia", "urination", "pee"], 3, "Glucose-driven osmotic diuresis causes water loss and thirst.", ["diabetes", "urinary"], "hopc"),
    item("catabolic", "Weight loss and appetite", "Lost 4 kg with normal or increased appetite.", ["weight loss", "appetite", "catabolic", "tired"], 2, "Insulin resistance and relative insulin deficiency impair glucose use and promote catabolism.", ["diabetes", "constitutional"], "associated"),
    item("emergency", "DKA/HHS symptoms", "No vomiting, abdominal pain, drowsiness, deep breathing or severe dehydration.", ["vomiting", "abdominal pain", "drowsy", "confusion", "kussmaul", "dehydration", "ketones"], 3, "Ketosis and dehydration can become life-threatening metabolic emergencies.", ["diabetes", "vitals"], "redflag"),
    item("vision-neuro", "Vision and neuropathy symptoms", "Blurred vision, no numb feet or ulcers.", ["blurred vision", "vision", "numb", "neuropathy", "feet", "ulcer"], 2, "Hyperglycaemia changes lens osmolarity; chronic disease damages nerves and vessels.", ["diabetes"], "associated"),
    item("risk", "Cardiometabolic risk", "Central obesity, father with T2DM, sedentary job, hypertension.", ["family history", "obesity", "hypertension", "cholesterol", "sedentary", "risk"], 2, "Insulin resistance clusters with adiposity, hypertension and dyslipidaemia.", ["diabetes", "cardiac"], "background"),
    item("meds-infection", "Medication and infection triggers", "No steroids or antipsychotics; no dysuria or fever.", ["steroids", "prednisone", "antipsychotic", "infection", "dysuria", "fever"], 1, "Intercurrent illness and medications can unmask hyperglycaemia.", ["meds", "infection"], "background")
   ],
   examination: [
    item("vitals-hydration", "Vitals and hydration", "BP 146/88, HR 88, BMI 32, mildly dry mucous membranes.", ["vitals", "hydration", "bmi", "blood pressure", "mucous membranes"], 2, "Dehydration severity helps decide outpatient versus ED workup.", ["vitals", "diabetes"], "exam", "general"),
    item("glucose", "Bedside capillary glucose and ketones", "Fingerprick glucose 18.6 mmol/L; ketones 0.3 mmol/L.", ["fingerprick", "bgl", "glucose", "ketones", "capillary"], 3, "Ketones separate uncomplicated hyperglycaemia from ketosis-prone emergency.", ["diabetes"], "exam", "bedside"),
    item("feet", "Foot and neurovascular examination", "Feet intact sensation and pulses, no ulcers.", ["foot exam", "monofilament", "pulses", "ulcers", "sensation"], 2, "Baseline foot assessment detects neuropathy and vascular disease.", ["diabetes"], "exam", "vascular"),
    item("eyes", "Vision and eye screen", "Visual acuity mildly reduced; no acute eye pain.", ["vision", "visual acuity", "eyes", "retina"], 1, "Formal retinal screening is needed after diagnosis, but acute eye symptoms may require urgent care.", ["diabetes"], "exam", "eyes")
   ],
   investigations: [
    ix("diagnosis", "HbA1c and fasting/random glucose", "HbA1c 10.2%; venous glucose 19 mmol/L with symptoms.", ["hba1c", "fasting glucose", "random glucose", "venous glucose"], "bloods", 3, "In symptomatic patients, marked hyperglycaemia can confirm diabetes without waiting for repeat testing.", ["diabetes", "bloods"]),
    ix("ketones-vbg", "Ketones and VBG if unwell", "Blood ketones low, VBG normal pH.", ["ketones", "vbg", "blood gas", "ph", "bicarbonate"], "bloods", 3, "Acidosis and ketones identify DKA physiology.", ["diabetes"]),
    ix("baseline", "UEC, eGFR, LFT, lipids, urine ACR", "eGFR 78, ALT mildly high, LDL elevated, urine ACR mildly elevated.", ["uec", "egfr", "lft", "lipids", "acr", "urine albumin"], "bloods", 2, "Baseline renal, liver and cardiovascular risk guide medication and risk reduction.", ["diabetes", "bloods"]),
    ix("infection", "Urinalysis and infection testing if symptoms", "Urine glucose positive, no nitrites or leukocytes.", ["urine dip", "urinalysis", "uti", "infection"], "bedside", 1, "UTI can cause frequency and precipitate hyperglycaemia.", ["urinary", "infection"]),
    ix("complications", "Retinal screening and ECG/CVD risk assessment", "Referred for retinal photography; ECG normal sinus rhythm.", ["retinal", "eye screen", "ecg", "cvd risk"], "special", 1, "Diabetes diagnosis is also a cardiovascular risk diagnosis.", ["diabetes", "cardiac"])
   ],
   management: [
    mx("exclude-emergency", "Exclude DKA/HHS and send to ED if unwell, ketotic or dehydrated", ["dka", "hhs", "ketones", "ed", "hospital", "dehydrated"], 3, "The immediate safety question is whether this is metabolic emergency."),
    mx("education", "Explain diagnosis, glucose symptoms and sick-day safety", ["education", "explain", "sick day", "symptoms", "diabetes educator"], 2, "Understanding osmotic symptoms improves adherence and safety."),
    mx("lifestyle", "Diet, weight, exercise and smoking/cardiovascular risk", ["diet", "exercise", "weight", "lifestyle", "smoking", "cardiovascular"], 2, "Lifestyle and vascular risk management reduce macrovascular complications."),
    mx("medication", "Start glucose-lowering therapy according to RACGP/local guidance", ["metformin", "glucose lowering", "medication", "start treatment"], 2, "Medication choice depends on symptoms, HbA1c, renal function and patient factors."),
    mx("follow-up", "Arrange close follow-up and complication screening", ["follow up", "review", "feet", "eyes", "kidneys", "acr"], 2, "Early review catches deterioration and builds chronic disease systems.")
   ],
   doubleCheck: [
    "RACGP diabetes thresholds and first-line medication guidance were updated recently; confirm current handbook details.",
    ...commonDoubleCheck
   ]
  },
  {
   id: "mood-suicide-015",
   title: "Not Coping At Uni",
   presentation: "Low mood",
   frameworkId: "mood",
   setting: "GP",
   difficulty: "medium",
   hidden: false,
   stem: "A 23-year-old student presents with low mood, insomnia and falling attendance at university.",
   finalDiagnosis: "Major depressive episode with suicidal ideation",
   diagnosisAliases: ["depression", "major depression", "MDD", "suicidal ideation"],
   recording: [
    "He says he has felt flat most days for two months and has stopped seeing friends.",
    "He is sleeping four hours a night and feels guilty about failing assignments.",
    "He says life feels pointless but looks away when asked what he means.",
    "He drinks heavily on weekends and has recently broken up with his partner."
   ],
   ddx: {
    must: [
     ddx("Major depressive episode", "Low mood, anhedonia and functional impairment over weeks fit depression.", false),
     ddx("Suicide risk", "Any hopelessness or self-harm thoughts must be asked directly.", true),
     ddx("Bipolar disorder", "Antidepressant decisions are unsafe without mania screening.", true)
    ],
    should: [
     ddx("Anxiety disorder", "Sleep and avoidance may reflect anxiety or mixed depression/anxiety."),
     ddx("Substance-related mood disorder", "Alcohol can worsen mood and impulsivity."),
     ddx("Hypothyroidism or anaemia", "Medical mimics can contribute to fatigue and low mood.")
    ],
    bonus: [ddx("Adjustment disorder", "A stressor can trigger distress but does not remove suicide assessment need.")]
   },
   history: [
    item("mood", "Core depressive symptoms and duration", "Low mood most days for two months with anhedonia and poor concentration.", ["low mood", "depressed", "anhedonia", "interest", "concentration", "duration"], 3, "Duration, pervasiveness and function distinguish disorder from transient sadness.", ["mood"], "hopc"),
    item("suicide", "Suicide thoughts, plan, intent and means", "Passive thoughts most days; has thought about overdosing but no tablets stockpiled and no immediate intent.", ["suicide", "self harm", "kill", "end life", "plan", "intent", "means", "overdose"], 3, "Direct risk assessment does not implant ideas; it reveals modifiable immediate danger.", ["mood"], "redflag"),
    item("protective", "Protective factors and supports", "Close sister knows he is struggling; willing to call her from the clinic.", ["supports", "protective", "family", "friends", "reasons to live", "safe"], 2, "Protective factors reduce isolation but do not erase risk.", ["mood"], "background"),
    item("mania", "Mania or hypomania screen", "No periods of decreased need for sleep with elevated mood, grandiosity or risky behaviour.", ["mania", "hypomania", "elevated", "grandiose", "risky", "decreased need sleep"], 3, "Bipolar depression needs different treatment; antidepressant monotherapy can destabilise mood.", ["mood"], "redflag"),
    item("psychosis", "Psychotic symptoms", "No hallucinations, delusions or command voices.", ["psychosis", "voices", "hallucinations", "delusions", "paranoia"], 2, "Psychosis increases risk and may require urgent specialist care.", ["mood"], "redflag"),
    item("substance-medical", "Substance and medical contributors", "Binge drinks on weekends; no stimulant use; no thyroid or anaemia symptoms.", ["alcohol", "drugs", "stimulants", "thyroid", "anaemia", "medical"], 2, "Substances can worsen impulsivity and sleep; medical mimics are treatable.", ["mood", "meds"], "background")
   ],
   examination: [
    item("mse", "Mental state examination", "Withdrawn, slowed speech, low affect, coherent thoughts, no psychosis.", ["mental state", "mse", "affect", "speech", "thoughts", "appearance"], 3, "MSE identifies severity, psychosis and immediate behavioural risk.", ["mood"], "exam", "mental"),
    item("risk", "Immediate safety assessment", "No intoxication, no self-harm injuries, agrees not to be alone tonight.", ["risk", "safety", "self harm", "injuries", "intoxication"], 3, "Immediate environment and intoxication change whether outpatient safety planning is appropriate.", ["mood"], "exam", "mental"),
    item("physical", "Physical examination", "Vitals normal, no tremor, normal weight trend by records.", ["vitals", "tremor", "weight", "physical exam"], 1, "Physical findings can point to endocrine, substance or eating-disorder contributors.", ["thyroid"], "exam", "general"),
    item("capacity", "Function and self-care", "Reduced attendance and poor meals but maintaining hygiene.", ["function", "self care", "hygiene", "attendance", "study"], 2, "Functional impairment guides urgency and support needs.", ["mood"], "exam", "mental")
   ],
   investigations: [
    ix("screening", "PHQ-9 or structured symptom measure", "PHQ-9 severe range; item 9 positive.", ["phq", "phq9", "screening", "questionnaire"], "bedside", 1, "Scores support monitoring but do not replace clinical risk assessment.", ["mood"]),
    ix("bloods", "FBE, TSH, B12, iron, UEC/LFT if indicated", "No anaemia, TSH normal, LFT mildly raised.", ["fbe", "tsh", "b12", "iron", "uec", "lft", "bloods"], "bloods", 2, "Medical contributors and alcohol effects can worsen depressive symptoms.", ["bloods", "thyroid"]),
    ix("substance", "Alcohol and substance assessment", "AUDIT-C positive for risky drinking.", ["audit", "alcohol screen", "substance", "drugs"], "special", 1, "Alcohol raises impulsivity and reduces sleep quality.", ["mood"]),
    ix("urgent", "Crisis assessment if risk escalates", "Not activated today because no immediate intent and supports engaged.", ["cat team", "crisis", "acute mental health", "ed"], "special", 3, "Moderate-to-high or uncertain suicide risk needs urgent specialist assessment.", ["mood"]),
    ix("followup", "Planned follow-up interval", "Review booked in 48 hours plus phone check tomorrow.", ["follow up", "review", "phone call", "check in"], "special", 2, "Risk fluctuates; early review is an intervention.", ["mood"])
   ],
   management: [
    mx("risk", "Complete suicide risk assessment and document plan, intent, means and supports", ["suicide risk", "plan", "intent", "means", "supports", "document"], 3, "Safe management begins with explicit risk formulation."),
    mx("safety-plan", "Collaborative safety plan and means restriction", ["safety plan", "means restriction", "remove tablets", "safe", "lifeline", "beyond now"], 3, "Safety planning gives concrete steps for the period when urges rise."),
    mx("supports", "Involve supports with consent and avoid leaving patient isolated if unsafe", ["family", "sister", "supports", "not alone", "consent"], 2, "Social containment can reduce immediate risk."),
    mx("treatment", "Discuss psychological therapy, GP mental health plan and medication options after bipolar screen", ["psychologist", "mental health plan", "ssri", "antidepressant", "therapy"], 2, "Treatment should match diagnosis and risk, not just symptom labels."),
    mx("crisis", "Escalate to ED or crisis team if current intent, psychosis, intoxication or unsafe supports", ["ed", "crisis", "cat", "000", "urgent", "psychosis", "intent"], 3, "High acute risk requires containment beyond routine outpatient follow-up.")
   ],
   doubleCheck: [
    "Local crisis team names and referral pathways vary by Victorian area mental health service.",
    "For real patients in immediate danger in Australia, call 000 or local crisis services.",
    ...commonDoubleCheck
   ]
  },
  {
   id: "vomit-dka-016",
   title: "Vomiting With Deep Breathing",
   presentation: "Abdominal pain",
   frameworkId: "diabetes",
   setting: "ED",
   difficulty: "hard",
   hidden: true,
   stem: "A 19-year-old woman presents with vomiting, abdominal pain and rapid breathing.",
   finalDiagnosis: "Diabetic ketoacidosis from new type 1 diabetes",
   diagnosisAliases: ["DKA", "diabetic ketoacidosis", "type 1 diabetes", "new diabetes"],
   recording: [
    "She has vomited six times and has diffuse abdominal pain without diarrhoea.",
    "Her mother says she has been drinking litres of water and losing weight for weeks.",
    "She looks dehydrated and is breathing deeply.",
    "She has no known medical history."
   ],
   ddx: {
    must: [
     ddx("Diabetic ketoacidosis", "Vomiting, abdominal pain, polyuria, weight loss and deep breathing are the pattern.", true, ["DKA"]),
     ddx("Sepsis", "Young patients with DKA can also have an infective trigger.", true),
     ddx("Surgical abdomen", "Abdominal pain can be true pathology or metabolic mimic.", true)
    ],
    should: [
     ddx("Gastroenteritis", "Vomiting common, but polyuria and Kussmaul breathing argue against simple gastro."),
     ddx("Pregnancy-related vomiting or ectopic", "Pregnancy test remains mandatory."),
     ddx("Toxic ingestion", "Metabolic acidosis and altered breathing can be toxicological.")
    ],
    bonus: [ddx("Hyperthyroidism", "Weight loss and tachycardia overlap but not ketosis.")]
   },
   history: [
    item("hyperglycaemia", "Polyuria, polydipsia and weight loss", "Three weeks of thirst, frequent urination and 6 kg weight loss.", ["polyuria", "polydipsia", "thirst", "weight loss", "urination"], 3, "Insulin deficiency causes hyperglycaemia, osmotic diuresis and catabolism.", ["diabetes", "urinary"], "hopc"),
    item("dka", "Vomiting, abdominal pain and breathing pattern", "Diffuse abdominal pain, repeated vomiting and deep rapid breathing.", ["vomiting", "abdominal pain", "deep breathing", "kussmaul", "rapid breathing"], 3, "Ketonaemia causes metabolic acidosis; respiratory compensation produces Kussmaul breathing.", ["diabetes", "abdominalPain"], "redflag"),
    item("mental", "Mental state and dehydration", "Drowsy but rousable; very thirsty and dizzy standing.", ["drowsy", "confusion", "dehydration", "dizzy", "collapse"], 3, "Severe dehydration and acidosis impair cerebral perfusion and consciousness.", ["vitals", "diabetes"], "redflag"),
    item("trigger", "Infection or missed insulin trigger", "No known diabetes; mild sore throat last week, no dysuria.", ["infection", "fever", "sore throat", "dysuria", "missed insulin", "trigger"], 2, "Infection increases counter-regulatory hormones and insulin requirements.", ["infection", "diabetes"], "associated"),
    item("pregnancy", "Pregnancy possibility", "Sexually active; period late by one week.", ["pregnant", "pregnancy", "lmp", "contraception", "sex"], 2, "Pregnancy changes differential, fluid priorities and obstetric involvement.", ["pregnancy"], "background"),
    item("tox", "Medication or toxin screen", "No alcohol binge, salicylates, SGLT2 inhibitors or illicit drug use.", ["alcohol", "salicylate", "aspirin", "sglt2", "drugs", "tox"], 1, "Other causes of high anion gap acidosis can mimic DKA.", ["meds"], "background")
   ],
   examination: [
    item("vitals", "Vitals and hydration", "HR 128, BP 94/60, RR 30 deep, afebrile, dry mucous membranes.", ["vitals", "heart rate", "blood pressure", "respiratory rate", "dehydration", "dry"], 3, "DKA causes severe osmotic dehydration and compensatory hyperventilation.", ["vitals", "diabetes"], "exam", "general"),
    item("glucose-ketones", "Bedside glucose and ketones", "Capillary glucose 28 mmol/L, ketones 6.2 mmol/L.", ["glucose", "bgl", "ketones", "fingerprick", "capillary"], 3, "Hyperglycaemia plus ketonaemia makes DKA likely before formal bloods return.", ["diabetes"], "exam", "bedside"),
    item("abdo", "Abdominal examination", "Diffuse tenderness without guarding or localised peritonism.", ["abdominal exam", "guarding", "peritonism", "tenderness"], 2, "DKA can cause abdominal pain; focal peritonism would suggest a surgical trigger or mimic.", ["abdominalPain"], "exam", "abdomen"),
    item("infection", "Infection source examination", "Throat mildly erythematous, chest clear, no skin infection.", ["source", "throat", "chest", "skin", "infection"], 1, "A trigger search is essential because infection can drive DKA.", ["infection"], "exam", "general")
   ],
   investigations: [
    ix("vbg", "Venous blood gas", "pH 7.12, bicarbonate 9, high anion gap metabolic acidosis.", ["vbg", "blood gas", "ph", "bicarbonate", "anion gap"], "bloods", 3, "Acidosis severity defines DKA risk and monitoring intensity.", ["diabetes", "bloods"]),
    ix("electrolytes", "UEC including potassium", "Potassium 5.4 initially, creatinine elevated from dehydration.", ["uec", "electrolytes", "potassium", "creatinine", "renal"], "bloods", 3, "Total body potassium is depleted even if serum potassium starts high; insulin shifts potassium into cells.", ["bloods", "diabetes"]),
    ix("hcg", "Pregnancy test", "Urine hCG negative.", ["pregnancy test", "hcg", "lmp"], "bedside", 2, "Pregnancy changes risk and management priorities.", ["pregnancy"]),
    ix("infection", "FBE, CRP, cultures and urine if infection suspected", "WCC mildly elevated, urine no nitrites, cultures sent.", ["fbe", "crp", "cultures", "urine", "infection"], "bloods", 2, "Infection is a common precipitant and may need treatment alongside DKA protocol.", ["infection", "bloods"]),
    ix("ecg", "ECG", "Sinus tachycardia, no hyperkalaemic changes.", ["ecg", "potassium", "arrhythmia"], "bedside", 1, "Potassium shifts can cause arrhythmias.", ["cardiac"])
   ],
   management: [
    mx("ed", "Immediate ED/resuscitation bay and senior endocrinology or medical input", ["ed", "resus", "hospital", "endocrine", "senior"], 3, "DKA is a life-threatening metabolic emergency."),
    mx("protocol", "DKA protocol: IV fluids, insulin infusion and potassium monitoring", ["fluids", "insulin infusion", "potassium", "dka protocol"], 3, "Treatment reverses dehydration, ketogenesis and electrolyte derangement."),
    mx("monitor", "Frequent glucose, ketone, VBG and electrolyte monitoring", ["monitor", "glucose", "ketones", "vbg", "electrolytes", "hourly"], 2, "Rapid shifts can cause hypoglycaemia, hypokalaemia and cerebral complications."),
    mx("trigger", "Find and treat precipitating cause", ["trigger", "infection", "cultures", "antibiotics", "precipitant"], 2, "Untreated triggers can prevent resolution."),
    mx("education", "After stabilisation: diabetes education, insulin skills and sick-day plan", ["education", "insulin", "sick day", "diabetes educator", "follow up"], 2, "Preventing recurrence requires practical insulin and illness management skills.")
   ],
   doubleCheck: [
    "DKA fluid, insulin and potassium protocols are highly protocolised; use local hospital DKA guidance.",
    ...commonDoubleCheck
   ]
  },
  {
   id: "fatigue-variceal-017",
   title: "Slowing Down After Bereavement",
   presentation: "Fatigue",
   frameworkId: "fatigue",
   setting: "GP",
   difficulty: "hard",
   hidden: true,
   stem: "A 67-year-old woman is brought to the GP by her son because she has been slowing down, feeling tired and becoming lightheaded.",
   finalDiagnosis: "Occult variceal upper GI bleed due to alcohol-related cirrhosis",
   diagnosisAliases: ["variceal bleed", "upper GI bleed", "cirrhosis", "portal hypertension", "melaena"],
   recording: [
    "Her son says she has not seemed herself for months and nearly fainted while gardening yesterday.",
    "She says it is probably age and grief since her husband died several years ago.",
    "She has reduced appetite and has been more isolated.",
    "She looks pale, but denies any dramatic vomiting of blood."
   ],
   ddx: {
    must: [
     ddx("Upper GI bleeding", "Melaena, pallor and postural symptoms can be occult rather than dramatic haematemesis.", true, ["GI bleed", "melaena"]),
     ddx("Chronic liver disease with portal hypertension", "Alcohol history, bruising, jaundice and ascites would explain varices.", true, ["cirrhosis"]),
     ddx("Malignancy or colorectal cancer", "Fatigue plus appetite change and bleeding symptoms need malignancy considered.", true)
    ],
    should: [
     ddx("Iron deficiency anaemia", "Fatigue and reduced exercise tolerance can reflect chronic blood loss."),
     ddx("Depression or alcohol use disorder", "Bereavement and isolation matter, but should not explain away physical red flags."),
     ddx("Hypothyroidism", "A common fatigue mimic worth screening for.")
    ],
    bonus: [ddx("Heart failure or demand ischaemia", "Severe anaemia can unmask cardiac symptoms.")]
   },
   history: [
    item("fatigue-course", "Fatigue course and function", "Six to eight weeks of worsening tiredness with reduced exercise tolerance.", ["fatigue", "tired", "function", "exercise tolerance", "time course"], 2, "Progressive functional decline raises the probability of systemic disease over simple tiredness.", ["anaemia", "constitutional"], "hopc"),
    item("melaena", "Melaena and GI bleeding symptoms", "Intermittent black tarry stools for one to two weeks; no frank haematemesis.", ["melaena", "melena", "black stool", "dark stool", "blood", "haematemesis", "vomiting blood"], 3, "Digested upper GI blood turns stool black; variceal bleeding may present as occult or intermittent blood loss.", ["bowel", "anaemia"], "redflag"),
    item("postural", "Postural dizziness and syncope", "Lightheaded standing and near-faint while gardening.", ["dizzy", "lightheaded", "postural", "syncope", "collapse", "near faint"], 3, "Volume depletion and anaemia reduce cerebral perfusion, making haemodynamic compromise possible.", ["vitals", "anaemia"], "redflag"),
    item("liver", "Liver disease symptoms", "Abdominal fullness, easy bruising and mild yellowing of the eyes.", ["jaundice", "yellow", "bruising", "ascites", "abdominal swelling", "itch", "confusion"], 3, "Portal hypertension causes ascites and varices; impaired synthesis causes bruising and coagulopathy.", ["abdominalPain", "bloods"], "associated"),
    item("alcohol", "Alcohol intake after bereavement", "Four to six standard drinks most days since her husband died five years ago.", ["alcohol", "wine", "spirits", "beer", "bereavement", "drinking"], 3, "Long-term alcohol exposure can cause cirrhosis, portal hypertension and variceal formation.", ["meds"], "background"),
    item("constitutional", "Weight, appetite and systemic symptoms", "Reduced appetite but no fever or night sweats.", ["weight", "appetite", "fever", "night sweats", "constitutional"], 2, "Constitutional symptoms help separate malignancy, infection and chronic inflammatory disease.", ["constitutional"], "associated"),
    item("meds", "NSAIDs, anticoagulants and past history", "Hypertension on amlodipine; no anticoagulants, no NSAID excess, no known liver diagnosis.", ["nsaid", "ibuprofen", "aspirin", "anticoagulant", "warfarin", "medications", "past history"], 2, "NSAIDs and anticoagulants worsen bleeding risk; absence does not exclude varices.", ["meds", "bloods"], "background")
   ],
   examination: [
    item("vitals", "Vitals and postural blood pressure", "HR 102, BP 100/60 with postural drop, afebrile, SpO2 98%.", ["vitals", "postural", "blood pressure", "heart rate", "tachycardia", "orthostatic"], 3, "Tachycardia and postural hypotension suggest clinically important intravascular depletion.", ["vitals"], "exam", "general"),
    item("pallor", "General appearance and pallor", "Pale, tired, mildly icteric sclerae.", ["pallor", "pale", "jaundice", "icterus", "general appearance"], 2, "Pallor supports anaemia; scleral icterus points toward liver dysfunction or haemolysis.", ["anaemia"], "exam", "general"),
    item("stigmata", "Chronic liver disease stigmata", "Spider naevi, palmar erythema and bruising on forearms.", ["spider naevi", "palmar erythema", "bruising", "liver signs", "clubbing"], 3, "Oestrogen metabolism changes and synthetic dysfunction produce classic chronic liver signs.", ["bloods"], "exam", "general"),
    item("abdomen", "Abdominal examination for ascites and liver", "Mild distension with shifting dullness and a firm liver edge.", ["abdominal exam", "ascites", "shifting dullness", "liver", "hepatomegaly", "distension"], 3, "Ascites reflects portal hypertension and decompensated cirrhosis physiology.", ["abdominalPain"], "exam", "abdomen"),
    item("dre", "Digital rectal examination", "Melaena on glove, no obvious rectal mass.", ["rectal exam", "dre", "pr exam", "melaena", "melena"], 3, "Confirming melaena localises bleeding to upper GI or slow proximal bleeding and changes urgency.", ["bowel"], "exam", "rectal")
   ],
   investigations: [
    ix("fbe", "FBE and iron studies", "Hb 75 g/L with iron deficiency pattern and thrombocytopenia.", ["fbe", "haemoglobin", "hemoglobin", "iron", "ferritin", "platelets"], "bloods", 3, "Low Hb explains fatigue; thrombocytopenia can occur from portal hypertension and hypersplenism.", ["bloods", "anaemia"]),
    ix("coags-lft", "Coagulation profile and LFTs", "INR elevated, albumin low, AST greater than ALT, bilirubin mildly elevated.", ["inr", "coag", "lft", "albumin", "bilirubin", "ast", "alt"], "bloods", 3, "Raised INR and low albumin show impaired hepatic synthesis, increasing bleeding risk.", ["bloods"]),
    ix("renal-crossmatch", "UEC, group and hold or crossmatch", "Urea elevated, creatinine mildly elevated; group and crossmatch sent.", ["uec", "urea", "creatinine", "group and hold", "crossmatch"], "bloods", 2, "Upper GI bleeding raises urea through digestion of blood; crossmatch prepares for transfusion.", ["bloods"]),
    ix("ultrasound", "Abdominal ultrasound", "Cirrhotic liver morphology with ascites and splenomegaly.", ["ultrasound", "liver ultrasound", "ascites", "splenomegaly"], "imaging", 2, "Cirrhosis plus splenomegaly supports portal hypertension as the bleeding mechanism.", ["imaging"]),
    ix("endoscopy", "Urgent upper GI endoscopy", "Oesophageal varices with stigmata of recent bleeding.", ["endoscopy", "gastroscopy", "ogd", "varices", "upper gi"], "special", 3, "Endoscopy diagnoses and treats varices via band ligation.", ["bowel"])
   ],
   management: [
    mx("admit", "Urgent hospital admission, IV access and haemodynamic assessment", ["admit", "hospital", "ed", "iv access", "resus", "haemodynamic"], 3, "Occult variceal bleeding can deteriorate quickly and needs monitored care."),
    mx("resuscitate", "Fluid and blood product resuscitation guided by severity", ["fluids", "blood", "transfusion", "crossmatch", "resuscitation"], 3, "Restoring circulating volume and oxygen carrying capacity prevents shock and myocardial strain."),
    mx("variceal", "Treat suspected variceal bleed with vasoactive therapy, antibiotics and urgent endoscopy", ["terlipressin", "octreotide", "ceftriaxone", "antibiotics", "endoscopy", "banding"], 3, "Portal pressure reduction and infection prophylaxis improve outcomes in variceal haemorrhage."),
    mx("liver-care", "Manage decompensated cirrhosis and involve gastroenterology", ["gastroenterology", "hepatology", "ascites", "cirrhosis", "beta blocker"], 2, "Variceal bleeding is a complication of decompensated liver disease, not an isolated bleed."),
    mx("alcohol-support", "Alcohol withdrawal risk, cessation support and psychosocial care", ["alcohol", "withdrawal", "counselling", "addiction", "support"], 2, "Treating the driver reduces future decompensation and bleeding risk.")
   ],
   doubleCheck: [
    "Acute variceal bleed drug choices, transfusion thresholds and antibiotic regimens should be checked against current eTG and local Victorian hospital protocols.",
    ...commonDoubleCheck
   ]
  },
  {
   id: "chest-pericarditis-018",
   title: "Pleuritic Chest Pain After A Cold",
   presentation: "Chest pain",
   frameworkId: "chest-pain",
   setting: "ED",
   difficulty: "medium",
   hidden: false,
   stem: "A 32-year-old woman presents to ED with sharp central chest pain and shortness of breath for 24 hours.",
   finalDiagnosis: "Acute viral pericarditis",
   diagnosisAliases: ["pericarditis", "viral pericarditis", "myopericarditis"],
   recording: [
    "The pain is sharp, slightly left sided and worse with deep inspiration.",
    "She feels better sitting forward and worse lying flat.",
    "She had a viral upper respiratory illness about a week ago.",
    "She is anxious because the pain radiates to her left shoulder."
   ],
   ddx: {
    must: [
     ddx("Acute coronary syndrome", "Chest pain with shoulder radiation must be excluded even in younger patients.", true, ["ACS", "MI"]),
     ddx("Pulmonary embolism", "Pleuritic pain and dyspnoea overlap with PE.", true, ["PE"]),
     ddx("Pericarditis or myocarditis", "Positional pleuritic pain after viral illness is classic.", false)
    ],
    should: [
     ddx("Pneumonia", "Fever, cough and pleuritic pain can be respiratory infection."),
     ddx("Pneumothorax", "Sudden pleuritic pain and dyspnoea need consideration."),
     ddx("GORD or musculoskeletal pain", "Common mimics after dangerous causes are considered.")
    ],
    bonus: [ddx("Aortic dissection", "Less likely here but catastrophic if tearing pain, neuro deficit or hypotension.")]
   },
   history: [
    item("positional", "Positional and pleuritic pain features", "Sharp 7/10 central-left pain worse lying flat and deep breathing, relieved sitting forward.", ["pleuritic", "positional", "worse lying", "sitting forward", "deep breath", "sharp"], 3, "Inflamed pericardial layers rub more with recumbency and respiratory movement.", ["chestPain", "cardiac"], "hopc"),
    item("viral", "Recent viral prodrome", "Sore throat, fever and malaise one week ago, now mostly resolved.", ["viral", "cold", "sore throat", "fever", "malaise", "uri"], 2, "Viral inflammation is a common trigger for acute pericarditis.", ["infection"], "associated"),
    item("acs", "ACS red flags and risk", "No crushing exertional pressure, diaphoresis, jaw pain or cardiovascular risk factors.", ["crushing", "exertional", "jaw", "diaphoresis", "risk factors", "smoker"], 3, "ACS cannot be excluded by age alone; autonomic and exertional features alter risk.", ["chestPain", "cardiac"], "redflag"),
    item("pe", "VTE risk and PE symptoms", "No calf swelling, haemoptysis, recent travel, surgery or oestrogen therapy.", ["vte", "dvt", "calf", "haemoptysis", "travel", "surgery", "pill", "oestrogen"], 3, "PE causes pleuritic pain through pulmonary infarction and can mimic pericarditis.", ["vte", "shortnessBreath"], "redflag"),
    item("tamponade", "Syncope and haemodynamic symptoms", "No syncope, severe dizziness or collapse.", ["syncope", "collapse", "dizzy", "tamponade", "shock"], 3, "A large effusion can impair ventricular filling and cause obstructive shock.", ["vitals", "cardiac"], "redflag"),
    item("autoimmune", "Autoimmune and renal history", "No rash, joint swelling, renal disease or immunosuppression.", ["autoimmune", "sle", "rash", "joints", "renal", "immunosuppression"], 1, "Pericarditis can be inflammatory, uraemic or immune-mediated.", ["bloods"], "background")
   ],
   examination: [
    item("vitals", "Vitals and distress", "T 37.9, HR 102, BP 118/72, RR 22, SpO2 98%; leaning forward.", ["vitals", "temperature", "heart rate", "respiratory rate", "oxygen", "leaning forward"], 2, "Stability and oxygenation help triage ACS, PE, sepsis and tamponade risk.", ["vitals"], "exam", "general"),
    item("rub", "Cardiac auscultation for pericardial rub", "Scratchy pericardial friction rub loudest at the left lower sternal edge leaning forward.", ["pericardial rub", "friction rub", "auscultation", "heart sounds"], 3, "Inflamed pericardial surfaces create a superficial scratching sound.", ["cardiac"], "exam", "cardiovascular"),
    item("tamponade-signs", "Tamponade signs", "No hypotension, raised JVP or muffled heart sounds.", ["jvp", "muffled", "hypotension", "tamponade", "pulsus"], 3, "Tamponade restricts diastolic filling, causing obstructive shock physiology.", ["cardiac", "vitals"], "exam", "cardiovascular"),
    item("resp", "Respiratory examination", "Chest clear with equal air entry and no focal crackles.", ["resp exam", "lungs", "air entry", "crackles", "wheeze"], 2, "A normal chest exam makes pneumonia or pneumothorax less likely but does not exclude PE.", ["resp"], "exam", "respiratory"),
    item("dvt", "Leg examination for DVT", "No calf tenderness, asymmetry or swelling.", ["calf", "leg swelling", "dvt", "tenderness"], 2, "DVT signs increase PE probability in pleuritic chest pain.", ["vte"], "exam", "vascular")
   ],
   investigations: [
    ix("ecg", "ECG", "Diffuse concave ST elevation with PR depression and no reciprocal depression.", ["ecg", "st elevation", "pr depression", "reciprocal"], "bedside", 3, "Diffuse pericardial inflammation produces widespread ST change rather than territorial ischaemia.", ["cardiac"]),
    ix("troponin", "Troponin", "Mild troponin rise without dynamic ACS pattern.", ["troponin", "myocarditis", "myopericarditis"], "bloods", 3, "Troponin elevation suggests myocardial involvement and changes disposition.", ["cardiac", "bloods"]),
    ix("inflammatory", "FBE, CRP and ESR", "Mild leukocytosis with elevated CRP and ESR.", ["fbe", "crp", "esr", "inflammatory markers"], "bloods", 2, "Inflammation supports pericarditis and gives a baseline for response.", ["infection", "bloods"]),
    ix("cxr", "Chest X-ray", "Normal lungs and cardiac silhouette.", ["cxr", "chest xray", "pneumonia", "pneumothorax"], "imaging", 2, "CXR helps exclude pneumothorax, pneumonia and large effusion.", ["resp", "imaging"]),
    ix("echo", "Echocardiogram", "Small pericardial effusion, normal ventricular function, no tamponade.", ["echo", "echocardiogram", "effusion", "tamponade"], "special", 3, "Echo assesses effusion size, myocardial function and tamponade physiology.", ["cardiac"])
   ],
   management: [
    mx("risk", "Assess high-risk features and admit if unstable, febrile, large effusion or myocarditis", ["admit", "high risk", "fever", "effusion", "myocarditis", "unstable"], 3, "Disposition is driven by risk of tamponade, myocarditis or non-viral causes."),
    mx("anti-inflammatory", "NSAID therapy plus colchicine if appropriate and no contraindications", ["nsaid", "ibuprofen", "aspirin", "colchicine"], 3, "Anti-inflammatory treatment reduces symptoms and colchicine reduces recurrence."),
    mx("gastroprotection", "Gastroprotection and contraindication check", ["ppi", "gastroprotection", "renal", "ulcer", "contraindication"], 1, "NSAID harms matter in real patients and can be prevented."),
    mx("activity", "Avoid strenuous exercise until symptoms and markers settle", ["exercise", "activity", "rest", "return to sport"], 2, "Activity can worsen myocardial inflammation when myocarditis overlaps."),
    mx("safety-net", "Safety-net for worsening dyspnoea, syncope, palpitations or persistent fever", ["safety net", "return", "syncope", "shortness of breath", "palpitations", "fever"], 2, "These symptoms can signal tamponade, arrhythmia or myocarditis.")
   ],
   doubleCheck: [
    "Pericarditis NSAID and colchicine dosing, duration and admission criteria should be checked against current local guidance.",
    ...commonDoubleCheck
   ]
  },
  {
   id: "fever-endocarditis-019",
   title: "Five Days Of Fever With No Source",
   presentation: "Fever",
   frameworkId: "fever",
   setting: "ED",
   difficulty: "hard",
   hidden: true,
   stem: "A 38-year-old man presents to ED with five days of fever, fatigue and feeling increasingly unwell without a clear source.",
   finalDiagnosis: "Staphylococcus aureus infective endocarditis associated with intravenous drug use",
   diagnosisAliases: ["infective endocarditis", "endocarditis", "S aureus endocarditis"],
   recording: [
    "He has fevers, sweats and chills but no cough, dysuria or abdominal pain.",
    "He looks uncomfortable and says he has been run down.",
    "He has not seen a GP for years.",
    "He is reluctant when asked about substances."
   ],
   ddx: {
    must: [
     ddx("Sepsis of unclear source", "Fever with tachycardia and systemic symptoms needs sepsis physiology assessed.", true),
     ddx("Infective endocarditis", "Fever plus risk factors, murmur or embolic signs is a classic cannot-miss.", true),
     ddx("Pneumonia or UTI", "Common sources still need active screening even when symptoms are absent.", false)
    ],
    should: [
     ddx("Viral illness", "Common but should improve, and does not explain a new murmur."),
     ddx("HIV, hepatitis or STI-related illness", "Risk history changes testing and counselling."),
     ddx("Haematological malignancy", "Persistent fever, weight loss or night sweats would increase concern.")
    ],
    bonus: [ddx("Autoimmune inflammatory disease", "Consider if infection workup is unrevealing.")]
   },
   history: [
    item("fever-course", "Fever pattern and systemic symptoms", "Five days of worsening fever, sweats, chills, fatigue and reduced appetite.", ["fever", "chills", "rigors", "sweats", "fatigue", "appetite"], 2, "Persistent fever with systemic symptoms suggests inflammatory or infective burden.", ["infection", "constitutional"], "hopc"),
    item("sepsis", "Sepsis symptoms and deterioration", "Feels worse today but no confusion, chest pain or collapse.", ["confusion", "collapse", "deterioration", "sepsis", "shortness of breath", "chest pain"], 3, "Sepsis is organ dysfunction from dysregulated infection response and needs early recognition.", ["infection", "vitals"], "redflag"),
    item("source", "Respiratory, urinary, GI and skin source screen", "No cough, dysuria, abdominal pain or diarrhoea; has injection marks with occasional redness.", ["cough", "urine", "dysuria", "abdominal", "diarrhoea", "skin", "wound"], 2, "Source finding directs cultures, imaging and early antibiotics.", ["infection"], "associated"),
    item("ivdu", "Intravenous drug use and injecting practices", "Injects heroin daily and sometimes methamphetamine; inconsistent clean needle access.", ["ivdu", "inject", "heroin", "meth", "needles", "needle sharing", "substance"], 3, "Injection can introduce skin flora such as S aureus directly into the bloodstream.", ["infection"], "background"),
    item("endocarditis-risk", "Dental, valve and prosthetic risk factors", "No known valve disease or prosthetic valves; no recent dental work.", ["dental", "valve", "prosthetic", "previous endocarditis", "murmur"], 2, "Damaged or prosthetic valves increase bacterial adhesion, but IVDU can affect normal valves.", ["cardiac", "infection"], "background"),
    item("emboli", "Embolic or immune phenomena", "No focal weakness, visual loss or flank pain; has painful spots on fingers.", ["stroke", "weakness", "vision", "flank", "spots", "rash", "splinter"], 3, "Vegetations can embolise or trigger immune phenomena in skin, brain, kidney and spleen.", ["neuro", "infection"], "redflag"),
    item("bloodborne", "Sexual and blood-borne virus risk", "Multiple casual partners, inconsistent condoms and no recent HIV or hepatitis testing.", ["sexual", "condoms", "hiv", "hepatitis", "sti", "partners"], 1, "Blood-borne and sexual health risks should be addressed without stigma.", ["infection"], "background")
   ],
   examination: [
    item("vitals", "Vitals and sepsis screen", "T 38.6, HR 105, BP 110/70, RR 20, SpO2 97%; diaphoretic but alert.", ["vitals", "temperature", "heart rate", "blood pressure", "respiratory", "sepsis"], 3, "Tachycardia and fever may be early sepsis even before hypotension appears.", ["vitals", "infection"], "exam", "general"),
    item("murmur", "Cardiac auscultation", "New pansystolic murmur loudest at the apex.", ["murmur", "heart sounds", "cardiac exam", "auscultation"], 3, "Valve infection can damage leaflets and create regurgitant murmurs.", ["cardiac", "infection"], "exam", "cardiovascular"),
    item("skin", "Peripheral stigmata and injection sites", "Track marks, splinter haemorrhages and possible Janeway lesions.", ["skin", "track marks", "splinter", "janeway", "osler", "injection"], 3, "Peripheral signs reflect embolic, vascular and immune effects of endocarditis.", ["infection"], "exam", "skin"),
    item("resp-abdo", "Respiratory and abdominal examination", "Chest clear; abdomen soft with no focal tenderness or splenomegaly.", ["resp", "chest", "abdominal", "spleen", "tenderness"], 1, "A broad source exam prevents anchoring before cultures return.", ["resp", "abdominalPain"], "exam", "general"),
    item("neuro", "Neurological examination", "No focal neurological deficit.", ["neuro", "weakness", "speech", "cranial nerves", "stroke"], 2, "Septic emboli can cause stroke, making baseline neurology important.", ["neuro"], "exam", "neurological")
   ],
   investigations: [
    ix("cultures", "Three sets of blood cultures before antibiotics if stable", "Blood cultures grow Staphylococcus aureus.", ["blood cultures", "cultures", "before antibiotics", "staph"], "bloods", 3, "Cultures identify the organism and guide prolonged targeted antibiotics.", ["infection", "bloods"]),
    ix("bloods", "FBE, CRP, UEC, LFT and lactate", "WCC and CRP elevated, lactate normal, renal function currently normal.", ["fbe", "crp", "uec", "lft", "lactate", "bloods"], "bloods", 2, "Inflammation and organ function guide severity and antimicrobial safety.", ["bloods", "infection"]),
    ix("echo", "Echocardiography", "Mitral valve vegetation with regurgitation.", ["echo", "echocardiogram", "vegetation", "valve"], "special", 3, "Echo demonstrates vegetations and valve complications.", ["cardiac", "infection"]),
    ix("ecg-cxr", "ECG and chest X-ray", "Sinus tachycardia; CXR clear.", ["ecg", "cxr", "chest xray"], "bedside", 1, "Baseline cardiopulmonary testing screens mimics and complications.", ["cardiac", "resp"]),
    ix("viruses", "HIV, hepatitis B/C and STI testing with consent", "Screening sent with consent.", ["hiv", "hepatitis", "hbv", "hcv", "sti"], "bloods", 1, "Risk identification allows treatment, vaccination and harm reduction support.", ["infection"])
   ],
   management: [
    mx("sepsis", "Assess sepsis, obtain IV access and escalate early", ["sepsis", "iv access", "senior", "resus", "hospital"], 3, "Endocarditis can deteriorate through sepsis, emboli or valve failure."),
    mx("cultures-antibiotics", "Take blood cultures before empiric IV antibiotics if this does not delay care", ["blood cultures", "before antibiotics", "iv antibiotics", "empiric"], 3, "Premature antibiotics can sterilise cultures; unstable patients still need immediate treatment."),
    mx("specialists", "Admit under medicine with infectious diseases and cardiology input", ["admit", "infectious diseases", "cardiology", "medicine"], 2, "Endocarditis needs prolonged therapy and monitoring for surgical indications."),
    mx("complications", "Monitor for heart failure, embolic stroke, renal injury and persistent bacteraemia", ["heart failure", "stroke", "renal", "embol", "monitor", "bacteraemia"], 2, "Vegetations can destroy valves and seed emboli to multiple organs."),
    mx("harm-reduction", "Offer non-judgemental substance, needle exchange and opioid treatment support", ["harm reduction", "needle exchange", "opioid", "addiction", "substance"], 2, "Reducing injecting harms lowers recurrence and improves engagement.")
   ],
   doubleCheck: [
    "Empiric endocarditis antibiotic choices and surgical indications should be checked against current eTG, local microbiology and hospital policy.",
    ...commonDoubleCheck
   ]
  },
  {
   id: "cough-aspiration-stroke-020",
   title: "Fever And Cough After A Funny Turn",
   presentation: "Cough",
   frameworkId: "fever",
   setting: "ED",
   difficulty: "hard",
   hidden: true,
   stem: "A 74-year-old man presents to ED with fever, productive cough and new confusion over two days.",
   finalDiagnosis: "Aspiration pneumonia secondary to recent minor stroke with dysphagia",
   diagnosisAliases: ["aspiration pneumonia", "stroke", "cva", "dysphagia", "pneumonia after stroke"],
   recording: [
    "His wife says he has been sleepy and not eating much.",
    "He is coughing yellow sputum and is more short of breath today.",
    "She noticed he coughed when drinking tea.",
    "A few days ago his speech sounded odd and his right arm seemed weak, but it settled."
   ],
   ddx: {
    must: [
     ddx("Community-acquired pneumonia or sepsis", "Fever, productive cough and hypoxia require infection severity assessment.", true),
     ddx("Aspiration pneumonia", "Cough after eating or drinking suggests impaired swallow and aspiration.", true),
     ddx("Stroke or TIA", "Transient speech and arm symptoms with dysphagia is a hidden driver.", true)
    ],
    should: [
     ddx("COVID or viral pneumonia", "Viral respiratory illness remains common."),
     ddx("Heart failure", "Dyspnoea and crackles can be cardiac."),
     ddx("Pulmonary embolism", "Confusion and dyspnoea can be atypical in older patients.")
    ],
    bonus: [ddx("Lung cancer with post-obstructive pneumonia", "Older ex-smoker with recurrent or focal pneumonia would raise concern.")]
   },
   history: [
    item("infection", "Cough, sputum, fever and dyspnoea", "Two days of fever, chills, yellow sputum, shortness of breath and reduced intake.", ["cough", "sputum", "fever", "shortness of breath", "dyspnoea", "reduced intake"], 3, "Pneumonia causes alveolar inflammation, impaired gas exchange and systemic inflammatory response.", ["resp", "infection"], "hopc"),
    item("confusion", "Delirium and sepsis symptoms", "More sleepy and confused than baseline, no collapse.", ["confusion", "delirium", "sleepy", "drowsy", "collapse", "sepsis"], 3, "Older patients may show infection severity through delirium rather than dramatic respiratory symptoms.", ["infection", "vitals"], "redflag"),
    item("swallow", "Swallowing, choking and aspiration symptoms", "Coughing with fluids and food going down the wrong way over recent days.", ["swallow", "choking", "cough with eating", "aspiration", "dysphagia", "drinking"], 3, "Dysphagia allows oropharyngeal contents to enter the lower airway, often affecting dependent lung zones.", ["resp", "neuro"], "associated"),
    item("neuro-event", "Recent focal neurological symptoms", "Three to four days ago he had slurred speech and right arm weakness for about 30 minutes.", ["stroke", "tia", "slurred speech", "weakness", "face", "arm", "speech"], 3, "Transient focal deficits suggest TIA or minor stroke, which can leave unsafe swallow.", ["neuro"], "redflag"),
    item("baseline", "Baseline function and frailty", "Normally independent at home with wife, no baseline confusion.", ["baseline", "function", "independent", "frailty", "confusion"], 2, "Baseline function helps judge delirium severity and discharge safety.", ["falls"], "background"),
    item("risk", "Vascular and aspiration risk factors", "Hypertension, type 2 diabetes, hyperlipidaemia and ex-smoker.", ["hypertension", "diabetes", "cholesterol", "smoking", "risk factors"], 2, "Vascular risks make cerebrovascular disease more likely.", ["cardiac", "diabetes"], "background"),
    item("vaccination", "Vaccination and exposure history", "No sick contacts; influenza and pneumococcal vaccination status uncertain.", ["vaccination", "flu", "pneumococcal", "covid", "contacts"], 1, "Prevention history affects risk and later management.", ["infection", "resp"], "background")
   ],
   examination: [
    item("vitals", "Vitals, oxygenation and delirium screen", "T 38.5, HR 105, BP 110/65, RR 24, SpO2 93% room air; mildly confused.", ["vitals", "oxygen", "spo2", "temperature", "respiratory", "confusion"], 3, "Hypoxia plus delirium indicates higher-risk pneumonia and possible sepsis.", ["vitals", "resp", "infection"], "exam", "general"),
    item("resp", "Respiratory examination", "Reduced air entry and coarse crackles at the right base.", ["resp exam", "crackles", "air entry", "right base", "lungs"], 3, "Dependent right lower zone findings fit aspiration physiology.", ["resp"], "exam", "respiratory"),
    item("neuro", "Focused neurological examination", "Mild right upper limb weakness and subtle dysarthria persist.", ["neuro exam", "weakness", "speech", "dysarthria", "cranial nerves"], 3, "Persistent focal signs support recent stroke rather than isolated pneumonia delirium.", ["neuro"], "exam", "neurological"),
    item("swallow-exam", "Bedside swallow risk observation", "Coughs after a sip of water; voice becomes wet.", ["swallow", "water swallow", "wet voice", "cough"], 3, "Wet voice and coughing suggest unsafe swallow and aspiration risk.", ["neuro", "resp"], "exam", "bedside"),
    item("cardio", "Cardiovascular examination", "Tachycardic, no heart failure signs or new murmur.", ["cardio", "heart failure", "murmur", "oedema", "jvp"], 1, "Cardiac mimics and embolic sources remain relevant in older patients.", ["cardiac"], "exam", "cardiovascular")
   ],
   investigations: [
    ix("cxr", "Chest X-ray", "Right lower lobe consolidation.", ["cxr", "chest xray", "consolidation", "pneumonia"], "imaging", 3, "Dependent lower lobe consolidation is compatible with aspiration.", ["resp", "imaging"]),
    ix("bloods", "FBE, CRP, UEC, LFT, lactate and cultures if septic", "WCC and CRP elevated; renal function acceptable; cultures sent.", ["fbe", "crp", "uec", "lft", "lactate", "cultures"], "bloods", 2, "Inflammation and organ function guide pneumonia severity and antibiotic safety.", ["bloods", "infection"]),
    ix("ct-brain", "CT brain and stroke workup", "CT brain shows recent infarct; no haemorrhage.", ["ct brain", "ct head", "stroke", "haemorrhage", "infarct"], "imaging", 3, "Brain imaging separates ischaemic stroke from haemorrhage and supports stroke pathway decisions.", ["neuro", "imaging"]),
    ix("swallow", "Formal swallow assessment", "Speech pathology assessment confirms unsafe thin fluids.", ["speech pathology", "swallow assessment", "dysphagia", "thin fluids"], "special", 3, "Formal swallow assessment prevents ongoing aspiration while nutrition plans are made.", ["neuro", "resp"]),
    ix("ecg", "ECG and cardiovascular risk investigations", "ECG sinus rhythm; further stroke risk workup arranged.", ["ecg", "atrial fibrillation", "stroke workup", "carotid", "echo"], "bedside", 2, "Atrial fibrillation and vascular disease are treatable causes of embolic stroke.", ["cardiac", "neuro"])
   ],
   management: [
    mx("admit", "Admit, assess severity, give oxygen if needed and IV fluids if dehydrated", ["admit", "oxygen", "iv fluids", "severity", "hospital"], 3, "Hypoxia, delirium and aspiration risk make outpatient care unsafe."),
    mx("antibiotics", "Treat pneumonia with empiric antibiotics including aspiration considerations", ["antibiotics", "aspiration", "amoxicillin clavulanate", "pneumonia"], 3, "Aspiration pneumonia involves oral flora and impaired airway protection."),
    mx("nbm-swallow", "Keep nil by mouth until swallow assessed and involve speech pathology", ["nil by mouth", "nbm", "swallow", "speech pathology", "dysphagia"], 3, "Feeding before swallow assessment can perpetuate aspiration."),
    mx("stroke", "Activate stroke/TIA workup and secondary prevention", ["stroke", "tia", "antiplatelet", "statin", "ct", "secondary prevention"], 3, "Treating the pneumonia without addressing the stroke misses the cause of aspiration."),
    mx("safety", "Monitor delirium, oxygenation and new neurological deficits", ["monitor", "delirium", "oxygen", "neurology", "worsening"], 2, "Both infection and stroke can evolve rapidly in older patients.")
   ],
   doubleCheck: [
    "Aspiration pneumonia antibiotic choices and stroke secondary prevention should be checked against current local Victorian hospital and Australian stroke guidance.",
    ...commonDoubleCheck
   ]
  },

  // ── NEW HARD CASE 1 ── Palpitations ──────────────────────────────────────
  {
   id: "palp-phaeochromocytoma-001",
   title: "Palpitations In A Shift Worker",
   presentation: "Palpitations",
   frameworkId: "palpitations",
   setting: "GP",
   difficulty: "hard",
   hidden: true,
   stem: "A 34-year-old woman presents to your GP clinic saying she has been having palpitations.",
   finalDiagnosis: "Phaeochromocytoma",
   diagnosisAliases: ["phaeochromocytoma", "pheo", "phaeo", "paraganglioma", "catecholamine-secreting tumour", "chromaffin tumour"],
   recording: [
    "She describes episodic palpitations lasting five to twenty minutes, occurring two to four times per week for the past three months.",
    "During episodes she also feels profoundly sweaty and notices a pounding headache, but has attributed all of this to her rotating-shift nursing roster.",
    "She looks well between episodes and her only previous contact with this clinic was for oral contraceptive renewal two years ago.",
    "She is visibly reluctant to elaborate on her home life and gives single-word answers to questions about stress and relationships; she has a concealer-covered bruise on her left forearm."
   ],
   ddx: {
    must: [
     ddx("Phaeochromocytoma", "The triad of episodic palpitations, diaphoresis and headache has >90% positive predictive value when all three are present. A must-not-miss even though rare.", true, ["pheo", "phaeo", "paraganglioma"]),
     ddx("Paroxysmal supraventricular tachycardia", "Most common cause of episodic palpitations in young women; must be excluded with ambulatory monitoring.", true, ["SVT", "AVNRT", "AVRT"]),
     ddx("Panic disorder", "Episodic sympathetic surge can mimic phaeochromocytoma exactly; but panic does not explain sustained hypertension between attacks.", false, ["panic attack", "anxiety attack"]),
     ddx("Hyperthyroidism", "Persistent rather than episodic, but a mandatory metabolic screen item.", false, ["thyroid", "Graves disease", "thyrotoxicosis"]),
     ddx("Ventricular tachycardia", "Must-not-miss with structural heart disease; less likely here but warrants ECG.", true, ["VT", "ventricular tachycardia"])
    ],
    bonus: [
     ddx("Carcinoid syndrome", "Episodic flushing and tachycardia; distinguish by flushing character and urinary 5-HIAA."),
     ddx("Substance use - cocaine or stimulants", "Episodic sympathomimetic surges; relevant given occupational stress and the concealed home situation."),
     ddx("Mastocytosis", "Episodic flushing, urticaria, hypotension; rare but sometimes confused with phaeochromocytoma."),
     ddx("Hypoglycaemia", "Adrenergic symptoms during episodes; less likely without diabetes or relevant medications.")
    ]
   },
   history: [
    item("h-episode-character", "Episode character - all co-occurring symptoms", "Each episode begins abruptly: her heart pounds, she sweats profusely, gets a severe throbbing headache and feels as if something terrible is about to happen. Episodes resolve over twenty minutes.", ["episode", "attacks", "palpitations character", "describe episodes", "what happens", "sweating during", "headache during", "all symptoms"], 3, "The palpitation–diaphoresis–headache triad is the classic phaeochromocytoma presentation. Candidates who ask about each symptom separately score less than those who elicit the triad together.", ["cardiac", "autonomic"], "episode"),
    item("h-triggers", "Triggers and posture", "Episodes can come on bending to make a bed, after eating cheese or dark chocolate, or without any clear trigger. Never with exercise alone.", ["trigger", "precipitant", "position", "exercise", "what brings on", "food", "bend", "strain"], 3, "Postural triggers and tyramine-containing foods suggest catecholamine release from a tumour compressed by movement or dietary tyramine.", ["cardiac", "autonomic"], "episode"),
    item("h-bp-between", "Blood pressure between episodes", "She has never been told she has high blood pressure. She donates blood regularly and was told her BP was 'a bit high' twice in the past year but assumed it was white-coat.", ["blood pressure", "hypertension", "bp between episodes", "high bp", "resting blood pressure"], 3, "Episodic or sustained hypertension between attacks is present in ~50% of phaeochromocytoma; she has subtle sustained hypertension she has rationalised.", ["cardiac", "autonomic"], "cardiovascular"),
    item("h-medications", "Current medications", "Microgynon 30 (combined OCP). No herbal supplements. No recreational drugs. Rarely drinks.", ["medications", "drugs", "pill", "contraception", "ocp", "supplements", "herbal"], 2, "Combined OCP can modestly raise BP; she takes no MAOIs so there is no tyramine–MAOI interaction risk.", ["cardiac"], "medications"),
    item("h-family-history", "Family history of hypertension, tumours or sudden death", "Her maternal uncle had a 'kidney tumour' removed at age 40 and carries a genetic condition she cannot name. Her mother has hypertension.", ["family history", "hereditary", "relatives", "genetics", "kidney tumour", "sudden death", "family cancer"], 3, "A family history of renal tumours in a young relative raises VHL syndrome or MEN2; phaeochromocytoma is hereditary in ~25% of cases.", ["cardiac", "autonomic", "malignancy"], "family"),
    item("h-systems-review", "Associated symptoms: weight, appetite, heat tolerance, tremor", "She has lost about 3 kg over three months without trying. No tremor at rest. Tolerates heat poorly - has always been 'warm' but it seems worse recently.", ["weight loss", "appetite", "heat", "heat intolerance", "tremor", "thyroid symptoms", "systems review"], 2, "Weight loss and heat intolerance overlap with thyrotoxicosis; catecholamine excess also drives hypermetabolism.", ["thyroid", "autonomic"], "systems"),
    item("h-ipv-screen", "Safety at home - relationship and injury", "After building rapport, she discloses that her partner becomes 'rough' when he drinks, approximately weekly. She is not ready to leave and has not told anyone. The bruise on her arm is from last week.", ["safety", "home", "domestic", "partner", "relationship", "violence", "abuse", "bruise", "ipv", "safe at home"], 3, "IPV is present and must be addressed sensitively alongside the medical workup. Disclosure at the GP is a critical opportunity; mandatory reporting does not apply to adult IPV in Victoria but duty-of-care safety planning does.", ["safety", "psychosocial"], "psychosocial"),
    item("h-shift-work", "Work and sleep pattern", "Night-shift nursing on a ten-week rotating roster. Significant sleep disruption. Has normalised her symptoms as shift-work-related.", ["work", "shift", "sleep", "stress", "nursing", "occupation", "roster"], 1, "Shift-work attribution is a classic cognitive anchor that delays phaeochromocytoma diagnosis.", ["autonomic"], "social"),
    item("h-syncope", "Syncope, near-syncope or chest pain during episodes", "No syncope. Chest pressure occurs during the worst episodes but she has not sought help for it.", ["syncope", "faint", "collapse", "chest pain", "chest pressure", "blackout"], 2, "Chest pressure during episodic hypertensive surges raises risk of demand ischaemia or Takotsubo cardiomyopathy.", ["cardiac"], "episode")
   ],
   examination: [
    item("ex-vitals", "Vital signs including bilateral arm BP", "BP right arm 158/98, left arm 156/96. HR 88 and regular. SpO2 99%. Temp 36.8. RR 14.", ["vitals", "blood pressure", "bp", "pulse", "heart rate", "sats", "temperature", "bilateral bp", "both arms"], 3, "Sustained hypertension between episodes is found in roughly half of phaeochromocytoma cases; bilateral BP excludes coarctation.", ["cardiac", "autonomic"], "cardiovascular"),
    item("ex-cardiac", "Cardiovascular and precordial examination", "Regular rhythm. No murmurs. No signs of heart failure. Normal apex beat.", ["cardiac exam", "heart sounds", "murmur", "precordial", "jvp", "oedema", "auscultation"], 2, "Sustained catecholamine excess can cause catecholamine cardiomyopathy; baseline cardiac exam guides further investigation.", ["cardiac"], "cardiovascular"),
    item("ex-thyroid", "Thyroid examination", "No goitre palpable. No lid lag, no tremor, no proptosis.", ["thyroid exam", "goitre", "lid lag", "tremor", "proptosis", "thyroid"], 2, "Thyroid examination is a mandatory part of the sympathetic-surge differential; normal exam reduces but does not exclude hyperthyroidism.", ["thyroid"], "endocrine"),
    item("ex-abdominal", "Abdominal examination including flanks", "No palpable mass. No flank tenderness. Mild epigastric discomfort on deep palpation.", ["abdominal exam", "abdomen", "flank", "mass", "adrenal", "kidney", "epigastric", "palpate"], 3, "Adrenal tumours are usually non-palpable but flank tenderness or epigastric discomfort on deep pressure prompts imaging. Avoid vigorous palpation if phaeochromocytoma is suspected - risk of hypertensive crisis.", ["autonomic"], "abdominal"),
    item("ex-skin", "Skin: neurofibromas, café-au-lait spots, bruising", "Three café-au-lait macules on trunk >15 mm. No axillary freckling. No neurofibromas. Resolving bruise left forearm consistent with blunt trauma.", ["skin", "cafe au lait", "neurofibromas", "bruising", "marks", "spots", "skin exam"], 3, "Café-au-lait spots raise NF1-associated phaeochromocytoma (NF1 affects ~10% of patients with the condition). The forearm bruise is corroborating evidence for IPV - document precisely.", ["autonomic", "malignancy"], "skin")
   ],
   investigations: [
    ix("urinary-metanephrines", "24-hour urinary metanephrines and catecholamines", "Urinary metanephrines markedly elevated at 4× upper limit of normal. Catecholamines elevated.", ["urinary metanephrines", "24 hour urine", "catecholamines", "vma", "vanillylmandelic acid", "metanephrines", "urine catecholamines"], "special", 3, "24-hour urinary metanephrines are preferred first-line biochemical test for phaeochromocytoma in Australian practice (sensitivity ~98%).", ["autonomic"]),
    ix("plasma-metanephrines", "Plasma free metanephrines", "Plasma free metanephrines elevated: normetanephrine 2.8× ULN, metanephrine 3.1× ULN.", ["plasma metanephrines", "plasma free metanephrines", "free metanephrines", "blood metanephrines"], "special", 3, "Plasma free metanephrines have high sensitivity and are an acceptable first-line alternative; both tests are valid per Endocrine Society guidelines.", ["autonomic"]),
    ix("ecg-palp", "12-lead ECG", "Sinus rhythm 86 bpm. Left ventricular hypertrophy voltage criteria met. No ischaemic changes.", ["ecg", "electrocardiogram", "12 lead", "rhythm", "cardiac", "ecg palp"], "bedside", 2, "LVH on ECG reflects sustained hypertensive load. ECG is essential to exclude arrhythmic cause of palpitations.", ["cardiac"]),
    ix("holter", "48-hour Holter or ambulatory ECG monitor", "Sinus rhythm throughout. No SVT or VT captured. No arrhythmia correlating with symptoms.", ["holter", "ambulatory ecg", "monitor", "loop recorder", "event monitor", "24 hour ecg", "ambulatory monitoring"], "special", 2, "Holter distinguishes phaeochromocytoma from arrhythmia-driven palpitations; absence of arrhythmia strengthens the catecholamine hypothesis.", ["cardiac"]),
    ix("tft-palp", "Thyroid function tests (TSH, free T4)", "TSH 1.2 mU/L (normal). Free T4 15 pmol/L (normal).", ["tsh", "thyroid function", "t4", "tft", "thyroid blood test", "thyroid function test"], "bloods", 2, "Thyrotoxicosis is a clinical mimic; normal TFTs remove it from the differential.", ["thyroid"]),
    ix("fbe-uec-glucose", "FBE, UEC, fasting glucose, LFTs", "FBE normal. UEC normal. Fasting glucose 5.1 mmol/L. LFTs mildly elevated (ALT 52).", ["fbe", "uec", "glucose", "lft", "bloods", "renal function", "liver function", "baseline bloods"], "bloods", 1, "Baseline bloods required; mild LFT elevation may reflect catecholamine-related hepatic effects.", ["cardiac"]),
    ix("ct-abdomen-adrenal", "CT abdomen and pelvis with contrast (only after alpha-blockade is established)", "Right adrenal mass 4.2 cm with heterogeneous enhancement. No distant metastases.", ["ct abdomen", "ct adrenal", "adrenal imaging", "mri abdomen", "imaging", "adrenal mass"], "imaging", 3, "CT localises the tumour. Contrast is safe after adequate alpha-blockade; giving contrast before biochemical confirmation and alpha-blockade risks a hypertensive crisis.", ["autonomic"]),
    ix("genetics-nf1", "Genetic counselling and mutation panel (NF1, VHL, RET, SDHB/C/D)", "Referred for genetic counselling; NF1 mutation detected.", ["genetics", "genetic testing", "hereditary", "nf1", "vhl", "ret", "sdh", "mutation", "genetic panel"], "special", 2, "~25% of phaeochromocytomas are hereditary. NF1 mutation confirms syndromic phaeochromocytoma; cascade family screening is required.", ["malignancy"])
   ],
   management: [
    mx("urgent-endocrine-ref", "Urgent endocrinology referral - same week", ["endocrine referral", "endocrinologist", "urgent referral", "specialist", "endocrine"], 3, "Phaeochromocytoma requires specialist-led medical preparation before any surgical intervention; GP-only management is unsafe."),
    mx("alpha-blockade", "Initiate alpha-adrenergic blockade (phenoxybenzamine or doxazosin) prior to surgery - under endocrine guidance", ["alpha blockade", "phenoxybenzamine", "doxazosin", "prazosin", "alpha blocker", "pre-op blockade"], 3, "Alpha-blockade for 10–14 days pre-operatively prevents intraoperative hypertensive crisis. Beta-blockade must never precede alpha-blockade - risk of unopposed alpha surge and fatal hypertension."),
    mx("no-beta-first", "Do NOT start beta-blocker before alpha-blocker is established", ["beta blocker", "metoprolol", "atenolol", "bisoprolol", "no beta first", "avoid beta blocker first"], 3, "Prescribing a beta-blocker first in phaeochromocytoma is a recognised dangerous error - causes unopposed alpha vasoconstriction and severe hypertension."),
    mx("ipv-safety-plan", "Address IPV: safety planning, document findings, offer 1800RESPECT and DV Victoria referral", ["domestic violence", "ipv", "safety plan", "1800respect", "dv victoria", "family violence", "abuse", "safeguarding", "safe steps"], 3, "IPV disclosure at a GP visit is a critical safety window. In Victoria, document sensitively, offer safety planning and warm referral; Safe Steps 1800 015 188 and 1800RESPECT 1800 737 732."),
    mx("bp-diary", "Regular BP monitoring and symptom diary of episodes until specialist seen", ["blood pressure monitoring", "bp diary", "symptom diary", "home bp", "episode diary"], 2, "Episode documentation guides surgical timing and confirms correlation with biochemical surges."),
    mx("avoid-triggers", "Advise avoidance of tyramine-rich foods, vigorous abdominal palpation and dopaminergic drugs pending specialist review", ["avoid tyramine", "food advice", "tyramine foods", "avoid palpation", "metoclopramide", "trigger avoidance"], 2, "Avoidable catecholamine surges can cause a hypertensive crisis before surgery."),
    mx("genetic-counsel", "Arrange genetics referral given family history of renal tumour", ["genetics referral", "genetic counselling", "family screening", "hereditary tumour", "nf1"], 2, "Hereditary phaeochromocytoma requires cascade family screening; NF1 mutation has additional multisystem surveillance implications.")
   ],
   examinerNotes: "This is a hard case because the stem gives only 'palpitations' and the diagnosis requires the candidate to proactively elicit the headache–diaphoresis–hypertension triad rather than stopping at a cardiac or anxiety explanation. Most candidates default to SVT and panic disorder without completing a sympathetic-surge systems review. The IPV thread is embedded as a concealer-covered bruise in the recording clip and on skin examination - it only surfaces if the candidate asks a trauma-informed safety question. Key errors to watch for: (1) not asking about co-occurring symptoms during episodes, (2) ordering CT before biochemical confirmation and alpha-blockade, (3) prescribing beta-blocker without first establishing alpha-blockade, (4) not addressing IPV despite the visible bruise.",
   discriminators: [
    "Asks specifically about headache and diaphoresis co-occurring with palpitations - not just palpitation character alone",
    "Elicits the family history of a 'kidney tumour' in a young relative and connects it to hereditary phaeochromocytoma syndromes",
    "Names urinary or plasma metanephrines as the preferred biochemical test - not a simple adrenaline level or adrenaline/noradrenaline",
    "States alpha-blockade must precede beta-blockade and must precede CT contrast administration",
    "Asks a trauma-informed safety question about the bruise and names 1800RESPECT or Safe Steps as a practical referral resource",
    "Does NOT recommend outpatient-only investigation without same-week endocrine referral"
   ],
   doubleCheck: [
    "Phenoxybenzamine is the standard pre-operative alpha-blocker in Australian endocrinology practice; check current eTG Endocrinology chapter for dosing and alternatives (doxazosin is also used).",
    "IPV documentation and referral pathways: Victoria - Safe Steps 1800 015 188; 1800RESPECT 1800 737 732.",
    "Contrast-enhanced CT before adequate alpha-blockade is contraindicated; confirm pre-imaging alpha-blockade status with your endocrinologist.",
    ...commonDoubleCheck
   ]
  },

  // ── NEW HARD CASE 2 ── Weight Loss ────────────────────────────────────────
  {
   id: "wl-coeliac-001",
   title: "Tired And Losing Weight",
   presentation: "Weight loss",
   frameworkId: "fatigue",
   setting: "GP",
   difficulty: "hard",
   hidden: true,
   stem: "A 28-year-old man presents to your GP clinic reporting that he has been losing weight.",
   finalDiagnosis: "Coeliac disease",
   diagnosisAliases: ["coeliac", "celiac", "coeliac disease", "gluten enteropathy", "gluten-sensitive enteropathy", "villous atrophy"],
   recording: [
    "He says he has lost about six kilograms over the past five months without dieting and feels it has just crept up on him.",
    "He initially volunteers nothing further; when prompted he adds that his energy 'has not been the same since he moved out of home.'",
    "He was born in Afghanistan and arrived in Australia seven years ago; he works long hours in a food-delivery job and has had no GP contact in the past four years.",
    "He appears thin, slightly pale, and is guarded - he says he is fine and that his family thinks he just needs to eat more red meat."
   ],
   ddx: {
    must: [
     ddx("Coeliac disease", "Insidious weight loss with micronutrient deficiency in a young adult is coeliac disease until proven otherwise; commonly missed when GI symptoms are absent or minimised.", true, ["coeliac", "celiac", "gluten intolerance", "gluten sensitivity"]),
     ddx("Malignancy - lymphoma or GI cancer", "Weight loss >5% body weight without explanation mandates cancer exclusion; small bowel lymphoma is a specific complication of untreated coeliac disease.", true, ["lymphoma", "cancer", "malignancy", "bowel cancer"]),
     ddx("Type 1 diabetes or LADA", "Young man with weight loss and fatigue; autoimmune overlap with coeliac disease makes LADA a genuine co-risk.", true, ["diabetes", "type 1 diabetes", "LADA", "autoimmune diabetes"]),
     ddx("Tuberculosis", "Afghan-born man - lifetime TB risk is substantially higher; systemic weight loss and fatigue warrant TB exclusion.", true, ["tuberculosis", "TB", "mycobacterium tuberculosis"]),
     ddx("Depression with weight loss", "Weight loss and fatigue in a recently isolated young man who works alone; depression is both a standalone diagnosis and a coeliac complication.", false, ["depression", "low mood", "mental health"])
    ],
    bonus: [
     ddx("Inflammatory bowel disease", "Crohn disease causes malabsorption and weight loss; needs colonoscopy if coeliac serology is negative."),
     ddx("Hyperthyroidism", "Weight loss with fatigue; less likely without heat intolerance or palpitations but screens easily."),
     ddx("HIV", "Systemic weight loss; relevant given limited healthcare access over four years."),
     ddx("Addison disease", "Autoimmune weight loss and fatigue; pigmentation and electrolyte disturbance are clues.")
    ]
   },
   history: [
    item("h-gi-stool", "Stool character, frequency and bloating", "His stools are 'sometimes loose and floaty' - two to four times per day. He notices increased flatus, worse after bread or pasta, but had not connected these to his weight loss.", ["bowel habit", "diarrhoea", "stool", "loose", "floaty", "pale stool", "bloating", "flatus", "bowel frequency", "gi symptoms", "steatorrhoea"], 3, "Steatorrhoea (pale, floating, offensive stools) is the hallmark of fat malabsorption from villous atrophy. Patients frequently normalise their bowel habit unless specifically asked about stool character.", ["malabsorption", "gi"], "gastrointestinal"),
    item("h-diet-shift", "Dietary pattern and changes since moving out of home", "He now eats a predominantly bread-, rice- and pasta-based diet because it is cheap and fast. At home his family cooked a mostly meat- and rice-based diet. His gluten exposure has increased markedly since moving out.", ["diet", "food", "eating", "nutrition", "what do you eat", "bread", "pasta", "wheat", "gluten", "food change"], 3, "Increased gluten exposure from a bread- and pasta-based diet is the precipitating dietary shift that unmasked symptomatic coeliac disease in an adult who was previously eating less wheat.", ["malabsorption"], "social"),
    item("h-fatigue-detail", "Fatigue: character, timing and functional impact", "He feels tired by early afternoon despite adequate sleep. Concentration at work is suffering; he has had two minor delivery accidents in the past month.", ["fatigue", "tired", "energy", "concentration", "function", "work performance", "afternoon tiredness"], 2, "Iron, folate and B12 deficiency from villous atrophy drive fatigue that is often disproportionate to the apparent weight loss.", ["malabsorption", "anaemia"], "systems"),
    item("h-tb-screen", "TB risk screen: cough, night sweats, haemoptysis, contacts", "Born in Kandahar; lived in a refugee camp in Pakistan for two years. No cough, no haemoptysis, no night sweats. No known TB contacts in Australia.", ["tuberculosis", "tb", "cough", "night sweats", "haemoptysis", "afghanistan", "refugee", "country of origin", "contacts", "fever"], 3, "TB is mandatory in any Afghan-born person with unexplained weight loss and fatigue. Night sweats and cough are absent here but IGRA testing is still warranted given the high background risk.", ["infection"], "infection"),
    item("h-mood-screen", "Mood, social connection, safety and help-seeking", "He misses his family. He has no close friends in Australia. He feels 'okay' but admits to feeling hopeless about his situation at times. He denies active suicidal ideation. He says he would not see a psychologist 'because Afghans don't do that'.", ["mood", "depression", "mental health", "hopeless", "anxiety", "sleep", "social", "lonely", "isolation", "safety", "suicidal", "wellbeing"], 3, "Depression is present but minimised and filtered through cultural norms. A forced referral will not be accepted; culturally concordant supports are needed.", ["psychosocial", "depression"], "psychosocial"),
    item("h-family-history", "Family history of bowel disease, coeliac, thyroid, diabetes or anaemia", "His mother has anaemia and 'problems with her stomach' but has never been investigated. Two maternal aunts also have anaemia.", ["family history", "coeliac family", "bowel disease", "relatives", "genetics", "anaemia family", "mother anaemia"], 2, "Maternal GI symptoms and anaemia in multiple female relatives is a strong coeliac family pattern; first-degree relatives have ~10% prevalence.", ["malabsorption"], "family"),
    item("h-medications", "Medications, supplements and healthcare access", "Takes no medications. Does not take vitamin D or iron supplements. Has had no healthcare in four years.", ["medications", "supplements", "vitamins", "iron", "healthcare access", "no medications"], 2, "Lack of supplementation means nutrient deficiencies will be clinically manifest; four years without healthcare access means preventive screening is overdue.", ["malabsorption"], "medications"),
    item("h-financial", "Financial situation and food security", "He sends most of his income overseas to his family. Some weeks he eats only one meal a day when delivery work is slow. He has not disclosed this to anyone.", ["financial", "money", "food security", "poverty", "eating", "hunger", "income"], 2, "Food insecurity contributes to his restricted diet and reduced help-seeking. Management plans that ignore this will not be followed.", ["psychosocial"], "social")
   ],
   examination: [
    item("ex-weight-vitals", "Vital signs, weight and BMI", "Weight 61 kg (was 67 kg six months ago on a delivery company weigh-in). BMI 19.2. BP 100/62. HR 82. Afebrile. SpO2 99%.", ["vitals", "weight", "bmi", "blood pressure", "pulse", "temperature", "weight loss objective"], 3, "Objective weight loss from a reliable external source is critical. Low BMI and borderline-low BP support malabsorption; BP is relevant to Addison disease screen.", ["malabsorption", "anaemia"], "cardiovascular"),
    item("ex-pallor-cheilitis", "General inspection: pallor, angular cheilitis, koilonychia, glossitis", "Mild conjunctival pallor. Angular cheilitis bilaterally. Nails are flat and faintly ridged (early koilonychia). No glossitis. No lymphadenopathy.", ["pallor", "anaemia signs", "angular cheilitis", "koilonychia", "nails", "glossitis", "general inspection", "conjunctiva"], 3, "Angular cheilitis (iron/B2 deficiency), koilonychia (iron deficiency) and pallor are peripheral stigmata of nutritional deficiency from malabsorption.", ["malabsorption", "anaemia"], "general"),
    item("ex-abdominal", "Abdominal examination", "Mild generalised abdominal distension. Hyperactive bowel sounds. No organomegaly. No mass. No peritonism.", ["abdominal exam", "abdomen", "bowel sounds", "distension", "organomegaly", "mass", "guarding"], 2, "Abdominal distension and hyperactive bowel sounds are consistent with fermentation and malabsorptive diarrhoea; organomegaly excludes lymphoma.", ["malabsorption", "gi"], "abdominal"),
    item("ex-skin-dh", "Skin: dermatitis herpetiformis, hyperpigmentation", "No dermatitis herpetiformis. No Addisonian hyperpigmentation. Dry skin over shins.", ["skin", "rash", "dermatitis herpetiformis", "pigmentation", "hyperpigmentation", "dh", "skin exam"], 2, "Dermatitis herpetiformis - intensely pruritic vesicular rash on extensor surfaces - is pathognomonic for coeliac disease. Addisonian pigmentation would shift the differential.", ["malabsorption"], "skin"),
    item("ex-neuro-vibration", "Peripheral neurological exam: reflexes, sensation, proprioception, vibration", "Reduced vibration sense bilateral feet. Ankle jerks mildly diminished. No frank weakness.", ["neurology", "reflexes", "sensation", "proprioception", "vibration", "peripheral neuropathy", "neuropathy", "ankle jerks"], 2, "Peripheral neuropathy from B12 and B1 deficiency occurs in coeliac disease and is reversible if treated early.", ["malabsorption", "neuro"], "neurological")
   ],
   investigations: [
    ix("coeliac-serology", "Coeliac serology: tTG-IgA AND total serum IgA", "tTG-IgA 180 U/mL (markedly elevated, reference <7). Total IgA normal - not IgA deficient.", ["coeliac serology", "ttg", "anti-ttg", "tissue transglutaminase", "iga", "total iga", "endomysial antibody", "ema", "coeliac blood test"], "special", 3, "tTG-IgA is the recommended first-line coeliac screen in Australia (RACGP). Total IgA must always be measured simultaneously to exclude false-negative from IgA deficiency.", ["malabsorption"]),
    ix("fbe-iron-coeliac", "FBE, iron studies (ferritin, serum iron, transferrin saturation)", "Hb 101 g/L microcytic (MCV 72). Ferritin 6 μg/L. Serum iron 5 μmol/L. Transferrin saturation 8%.", ["fbe", "full blood count", "iron studies", "ferritin", "iron deficiency", "anaemia", "haemoglobin", "mcv"], "bloods", 3, "Iron deficiency anaemia is the most common presentation of coeliac disease in adults, often preceding GI symptoms.", ["anaemia", "malabsorption"]),
    ix("b12-folate-coeliac", "Serum B12 and red cell folate", "B12 188 pmol/L (low-normal, reference 180–900). Red cell folate 98 nmol/L (low, reference 360–1400).", ["b12", "vitamin b12", "folate", "red cell folate", "vitamin deficiency", "b12 folate"], "bloods", 2, "Folate deficiency from proximal small bowel villous atrophy; low-normal B12 is consistent with early deficiency - both explain the peripheral neuropathy.", ["malabsorption", "anaemia"]),
    ix("igra-tb", "IGRA (QuantiFERON-TB Gold) for TB screening", "QuantiFERON-TB Gold negative.", ["igra", "quantiferon", "tb gold", "mantoux", "tb test", "tuberculosis test", "interferon gamma release", "latent tb"], "special", 3, "IGRA is preferred over Mantoux in BCG-vaccinated individuals. Negative result is reassuring; TB is effectively excluded.", ["infection"]),
    ix("bone-profile-coeliac", "Calcium, 25-OH vitamin D, ALP, PTH", "Calcium 2.18 mmol/L (low-normal). 25-OH vitamin D 22 nmol/L (severely deficient). ALP 112 U/L (elevated). PTH 9.2 pmol/L (elevated - secondary hyperparathyroidism).", ["calcium", "vitamin d", "bone", "alk phos", "alp", "pth", "parathyroid", "vitamin d level", "25 oh"], "bloods", 2, "Fat-soluble vitamin deficiency and secondary hyperparathyroidism from malabsorption predict low bone density; urgent vitamin D replacement is needed.", ["malabsorption"]),
    ix("tft-glucose-coeliac", "TSH, fasting glucose and HbA1c", "TSH 1.8 mU/L (normal). Fasting glucose 5.0 mmol/L. HbA1c 5.2%.", ["tsh", "thyroid", "glucose", "hba1c", "diabetes screen", "blood sugar", "thyroid function"], "bloods", 2, "Thyroid and diabetes exclusion is mandatory; autoimmune clustering means T1DM and thyroid disease are more common in coeliac disease.", ["thyroid"]),
    ix("gastro-biopsy", "Gastroenterology referral for confirmatory duodenal biopsy (OGD) - maintain gluten until biopsy", "Confirmatory duodenal biopsy arranged. Biopsy shows Marsh III villous atrophy.", ["gastroenterology", "biopsy", "ogd", "endoscopy", "duodenal biopsy", "small bowel biopsy", "gastro referral", "endoscopy referral"], "special", 3, "Australian guidelines require histological confirmation before committing to lifelong gluten-free diet. Do NOT start GFD before biopsy - this normalises the result and prevents diagnosis.", ["malabsorption"])
   ],
   management: [
    mx("maintain-gluten-biopsy", "Refer to gastroenterology - maintain gluten in diet until confirmatory biopsy is performed", ["gastroenterology referral", "biopsy", "maintain gluten", "do not start gfd", "keep eating gluten", "ogd", "endoscopy"], 3, "Starting a gluten-free diet before histological confirmation normalises the biopsy and prevents diagnosis - a common and consequential management error."),
    mx("nutrient-replacement", "Replace iron (oral or IV), folate, B12 and vitamin D urgently", ["iron supplementation", "vitamin d replacement", "folate", "b12", "nutritional replacement", "supplements", "deficiency treatment", "iv iron"], 3, "Oral iron first-line; IV iron (ferric carboxymaltose) if malabsorption is severe. Vitamin D replacement is urgent given severe deficiency and fracture risk."),
    mx("dietitian-gfd", "Refer to dietitian experienced in coeliac disease - culturally appropriate gluten-free diet", ["dietitian", "diet", "gluten free diet", "gfd", "dietitian referral", "nutrition", "gluten free"], 3, "Gluten-free diet is the only definitive treatment. Specialist dietitian guidance is essential, especially given food insecurity and cultural dietary constraints."),
    mx("depression-cultural-support", "Address depression sensitively - explore culturally acceptable supports, not just psychology referral", ["depression", "mental health", "cultural support", "community", "interpreting service", "transcultural mental health", "afghan community", "psychosocial support", "counselling"], 3, "A forced psychology referral will be declined. Culturally concordant supports are more likely to result in engagement. Victoria: Transcultural Mental Health Centre 1800 648 911."),
    mx("food-security-support", "Address food security: social worker referral, community health, FoodBank", ["food security", "foodbank", "social worker", "financial assistance", "bulk billing", "community health", "social support"], 2, "Food insecurity is a direct barrier to dietary treatment. Ignoring it produces a management plan the patient cannot follow."),
    mx("dexa-bone", "DEXA scan for bone mineral density given severe vitamin D deficiency and malabsorption", ["dexa", "bone density", "bone mineral density", "osteoporosis screen", "fracture risk"], 2, "Young men with coeliac disease have significantly increased fracture risk; DEXA at diagnosis guides supplementation intensity."),
    mx("family-screening", "Recommend first-degree family coeliac screening", ["family screening", "relatives", "first degree", "family testing", "coeliac screening"], 1, "First-degree relatives have ~10% prevalence; the maternal GI and anaemia history makes this particularly relevant.")
   ],
   examinerNotes: "This is a hard case because the stem says only 'weight loss' and the diagnosis (coeliac disease) is frequently dismissed as a simple GI condition rather than a multisystem malabsorption disorder. The patient actively minimises his bowel symptoms, his mood and his food insecurity. Candidates who stay at a surface level will generate a cancer- and TB-heavy DDx but miss the key dietary exposure shift and the steatorrhoea. Critical examiner markers: (1) asking about stool character specifically (floating, pale, offensive) rather than just 'any diarrhoea', (2) eliciting the dietary shift to bread/pasta since moving out, (3) ordering tTG-IgA WITH total IgA, (4) stating gluten must be maintained until biopsy, (5) TB IGRA rather than just CXR, (6) culturally appropriate mental health pathway rather than a generic psychology referral.",
   discriminators: [
    "Asks about stool character including floating or pale stools (steatorrhoea) - not just 'any diarrhoea'",
    "Elicits the dietary shift to a bread- and pasta-based diet since moving out and connects this to increased gluten exposure",
    "Orders tTG-IgA AND total serum IgA together - not tTG-IgA alone",
    "States that gluten must be maintained in the diet until after confirmatory biopsy - does NOT advise starting GFD before OGD",
    "Performs TB risk assessment and orders IGRA (not just CXR) given country of origin",
    "Asks a depression/safety screen and names a culturally appropriate referral pathway rather than a generic psychology referral",
    "Elicits food insecurity as a social driver and addresses it explicitly in the management plan"
   ],
   doubleCheck: [
    "Coeliac serology requires the patient to be on a gluten-containing diet for at least six weeks prior to testing; confirm dietary status before sending.",
    "IV iron dosing (ferric carboxymaltose) should be checked against current eTG Haematology chapter and local formulary.",
    "Vitamin D repletion regimens vary; check current Endocrine Society of Australia or eTG for loading vs maintenance dosing.",
    "Transcultural Mental Health Centre (Victoria) 1800 648 911; confirm current service availability.",
    ...commonDoubleCheck
   ]
  },

  // ── NEW HARD CASE 3 ── Syncope / TLOC ────────────────────────────────────
  {
   id: "syncope-hcm-021",
   title: "Blacked Out At The Gym",
   presentation: "Syncope",
   frameworkId: "falls-syncope",
   setting: "GP",
   difficulty: "hard",
   hidden: true,
   stem: "A 22-year-old man presents to your GP clinic after blacking out.",
   finalDiagnosis: "Hypertrophic cardiomyopathy",
   diagnosisAliases: ["hypertrophic cardiomyopathy", "HCM", "HOCM", "hypertrophic obstructive cardiomyopathy", "asymmetric septal hypertrophy"],
   recording: [
    "He says he felt fine beforehand and woke up on the gym floor with no warning.",
    "His training partner says it lasted about thirty seconds and he was confused briefly afterwards.",
    "He plays for a local AFL club and has never had anything like this before.",
    "He is eager to get back to training and asks if it was probably dehydration."
   ],
   ddx: {
    must: [
     ddx("Hypertrophic cardiomyopathy", "Exertional syncope without prodrome in a young athlete is HCM until proven otherwise - the leading cause of sudden cardiac death in young Australians under 35.", true, ["HCM", "HOCM", "hypertrophic cardiomyopathy"]),
     ddx("Long QT syndrome or other channelopathy", "Syncope during exercise or emotion with family sudden death history; ECG may be normal at rest.", true, ["long QT", "LQTS", "channelopathy", "Brugada"]),
     ddx("Ventricular tachycardia", "Structural heart disease or channelopathy can produce VT causing sudden loss of consciousness during exertion.", true, ["VT", "ventricular tachycardia", "arrhythmia"]),
     ddx("Vasovagal syncope", "Most common cause of syncope in young people - but the absence of prodrome and exertional timing makes this a diagnosis of exclusion here, not assumption.", false, ["vasovagal", "faint", "neurocardiogenic"]),
     ddx("Wolff-Parkinson-White syndrome", "Pre-excitation can cause rapid conduction and syncope, especially during exertion.", true, ["WPW", "Wolf Parkinson White", "pre-excitation", "accessory pathway"])
    ],
    bonus: [
     ddx("Anomalous coronary artery origin", "A structural cause of exertional ischaemia and sudden death in young athletes; not detectable on ECG alone."),
     ddx("Aortic stenosis", "Exertional syncope with a murmur; less likely at 22 without rheumatic history but must be sought."),
     ddx("Commotio cordis or chest trauma", "A direct blow to the chest before the syncopal event would raise this.")
    ]
   },
   history: [
    item("h-syncopal-event", "Full event description: before, during and after", "No warning - no nausea, no greying vision, no palpitations before collapse. Approximately 30-second loss of consciousness. Brief confusion on waking. No witnessed tonic-clonic activity.", ["before syncope", "prodrome", "warning", "loss of consciousness", "after syncope", "confusion", "recovery", "seizure", "tongue bite"], 3, "Absence of a vasovagal prodrome combined with exertional timing and post-event confusion is the cardinal pattern of cardiac syncope. Each element must be elicited separately to avoid missing the absence of warning.", ["cardiac", "neuro"], "episode"),
    item("h-exertional-timing", "Precise timing: what was he doing at the exact moment of collapse", "He was mid-set on a heavy squat - at peak Valsalva. Not cooling down, not just standing up, not during rest.", ["exertion", "timing", "during exercise", "lifting", "squat", "valsalva", "peak exercise", "what was he doing"], 3, "Syncope during peak exertion (not after) strongly favours outflow obstruction or arrhythmia over orthostatic or vasovagal mechanisms. Dynamic obstruction worsens with Valsalva in HCM.", ["cardiac"], "episode"),
    item("h-palpitations-before", "Palpitations, chest pain or dyspnoea during exercise prior to this event", "He recalls occasional awareness of his heart 'pounding differently' during sprints over the past few months but dismissed it as adrenaline. No chest pain. No exertional dyspnoea beyond fitness level.", ["palpitations", "chest pain", "dyspnoea", "exercise symptoms", "pounding", "racing heart", "exertional symptoms"], 3, "Episodic exertional palpitations in the weeks before a syncopal event suggest a structural or arrhythmic substrate being progressively provoked.", ["cardiac"], "associated"),
    item("h-family-history-cardiac", "Family history of sudden death, cardiomyopathy, arrhythmia or young cardiac events", "An older brother died unexpectedly in his sleep aged 19 - attributed to 'heart attack' at the time. His father was told he has a 'thick heart' but does not take any medication.", ["family history", "sudden death", "family cardiac", "cardiomyopathy", "arrhythmia", "young death", "thick heart", "sudden cardiac death"], 3, "A sibling sudden death and a father with known cardiomegaly creates a strong hereditary cardiomyopathy pedigree. This single item should pivot the entire consultation.", ["cardiac"], "family"),
    item("h-alcohol-drugs", "Alcohol, stimulants, recreational drugs and supplements", "Drinks socially. Takes pre-workout supplements containing caffeine and beta-alanine. No illicit stimulants, no cocaine.", ["alcohol", "drugs", "stimulants", "pre-workout", "caffeine", "cocaine", "supplements", "recreational drugs"], 2, "Pre-workout stimulants can trigger arrhythmia on a structural substrate; cocaine causes coronary vasospasm and arrhythmia. Neither explains the family history.", ["meds"], "background"),
    item("h-prev-sports-screen", "Prior sports medical screening or ECG", "Had a pre-season physical last year - cleared. No ECG performed. No echocardiogram.", ["sports screen", "pre-season", "ecg", "echo", "cardiac screen", "medical clearance"], 2, "Australian pre-participation cardiac screening is inconsistent; a normal physical examination does not exclude HCM or channelopathy.", ["cardiac"], "background"),
    item("h-elder-alcohol", "Home environment and stress - full social history", "Lives with parents. His father has struggled with alcohol since the brother's death. He is the primary support for his mother and feels pressure not to worry the family with his own health concerns.", ["family stress", "social history", "father alcohol", "home environment", "support", "pressure", "carer"], 2, "The father's alcohol use disorder and the patient's caretaker role constitute the psychosocial thread. It explains why he minimises symptoms and resists further workup ('eager to get back to training').", ["psychosocial"], "psychosocial")
   ],
   examination: [
    item("ex-vitals-syncope", "Vital signs and postural BP", "HR 62 regular. BP 118/76 sitting, 116/74 standing. SpO2 99%. Afebrile. No postural drop.", ["vitals", "blood pressure", "postural bp", "heart rate", "sats", "lying standing"], 3, "Absence of postural hypotension reduces orthostatic and volume-depletion explanations. Normal resting HR does not exclude HCM.", ["cardiac", "vitals"], "cardiovascular"),
    item("ex-cardiac-auscultation", "Cardiac auscultation including dynamic manoeuvres", "Ejection systolic murmur heard at the left sternal edge, grade 2/6. Murmur increases with Valsalva and standing, decreases with squatting.", ["cardiac auscultation", "murmur", "systolic murmur", "valsalva", "squatting", "dynamic auscultation", "heart sounds", "sternal edge"], 3, "Dynamic outflow murmur that increases with Valsalva (reduces preload) and decreases with squatting (increases preload) is the physical examination hallmark of HOCM. Most candidates who do not perform dynamic manoeuvres will miss or underinterpret this murmur.", ["cardiac"], "cardiovascular"),
    item("ex-pulse-character", "Pulse character and carotid palpation", "Pulse has a bifid quality on careful palpation. Carotid upstroke is sharp and bifid (spike-and-dome).", ["pulse character", "carotid", "bifid", "spike and dome", "jerky pulse", "pulsus bisferiens"], 2, "The spike-and-dome carotid pulse reflects early rapid ejection followed by outflow tract obstruction in HOCM.", ["cardiac"], "cardiovascular"),
    item("ex-neuro-post", "Neurological examination post-syncope", "GCS 15, cranial nerves intact, no focal motor or sensory deficit, no tongue laceration.", ["neuro exam", "focal neurology", "gcs", "tongue bite", "post syncope neuro", "cranial nerves"], 2, "Focal neurology post-syncope would suggest stroke or seizure rather than cardiac syncope. Tongue laceration would raise seizure probability.", ["neuro"], "neurological")
   ],
   investigations: [
    ix("ecg-syncope", "12-lead ECG", "Voltage criteria for left ventricular hypertrophy. Deep Q waves in I and aVL. ST-T wave changes in V4–V6. No delta wave.", ["ecg", "12 lead", "ecg syncope", "lvh", "left ventricular hypertrophy", "q waves", "st changes"], 3, "Significant ECG abnormalities (LVH, pathological Q waves, ST changes) in a young athlete are never a normal finding and mandate echocardiography. A normal ECG does not exclude HCM - ~5% have a normal ECG.", ["cardiac"]),
    ix("echo-urgent", "Urgent echocardiogram", "Asymmetric septal hypertrophy (IVS 22 mm). Systolic anterior motion of the mitral valve. Significant LVOT gradient 70 mmHg at rest.", ["echo", "echocardiogram", "echocardiography", "heart ultrasound", "lvot", "septal hypertrophy", "cardiomyopathy"], "imaging", 3, "Echocardiography is the definitive diagnostic test for HCM; LVOT gradient and septal thickness guide risk stratification and management.", ["cardiac"]),
    ix("holter-syncope", "24-48 hour Holter or event monitor", "Non-sustained VT run of 4 beats detected on Holter - a significant risk marker in HCM.", ["holter", "ambulatory ecg", "event monitor", "24 hour ecg", "arrhythmia monitoring", "vt"], "special", 3, "Non-sustained VT on Holter is an independent risk factor for sudden cardiac death in HCM and influences ICD implantation decisions.", ["cardiac"]),
    ix("genetic-hcm", "Genetic testing for sarcomeric mutations and family cascade", "Sarcomere mutation panel positive; family screening arranged for father and other siblings.", ["genetic testing", "sarcomere", "myosin", "hcm genetics", "family screening", "genetic panel"], "special", 2, "~60% of HCM cases carry an identifiable sarcomeric mutation; cascade family screening can identify at-risk relatives before sudden death.", ["cardiac"]),
    ix("bloods-syncope", "FBE, UEC, glucose, troponin", "All normal. Troponin negative.", ["fbe", "uec", "glucose", "troponin", "bloods", "electrolytes"], "bloods", 1, "Baseline bloods exclude metabolic syncope causes; troponin is negative here but must be considered post-arrhythmia.")
   ],
   management: [
    mx("no-sport-restriction", "Immediate exercise restriction - no competitive sport, no heavy lifting pending specialist review", ["no sport", "exercise restriction", "stop training", "stop competition", "no gym", "sports restriction", "activity restriction"], 3, "This is the single most time-critical management decision. Continuing competitive sport with undiagnosed HCM significantly increases sudden cardiac death risk. Must be communicated clearly and without ambiguity."),
    mx("urgent-cardiology", "Same-day or next-day cardiology referral - do not discharge with routine outpatient review", ["cardiology referral", "cardiologist", "urgent referral", "same day", "next day", "specialist"], 3, "HCM with syncope, LVOT obstruction and NSVT requires specialist risk stratification for ICD consideration; this is not a GP-only workup."),
    mx("icd-discussion", "Discuss ICD implantation risk stratification with cardiologist", ["icd", "defibrillator", "implantable", "risk stratification", "sudden death prevention"], 2, "Multiple HCM sudden death risk factors (syncope, NSVT, family SCD, LVOT gradient) likely meet threshold for ICD consideration."),
    mx("family-screening-hcm", "Arrange first-degree family cardiac screening - father and other siblings", ["family screening", "first degree", "relatives", "father", "siblings", "family hcm", "genetic screening"], 2, "Father has known cardiomegaly and a sibling died unexpectedly - both need urgent cardiac evaluation independent of the patient's diagnosis."),
    mx("psychosocial-father", "Address father's alcohol use disorder sensitively - offer GP mental health plan and AUDIT-C, referral to alcohol counselling", ["father alcohol", "alcohol use disorder", "audit", "family support", "counselling", "alcohol", "psychosocial"], 2, "The father's alcohol use disorder is driving family stress and the patient's symptom minimisation. Brief intervention and warm referral to alcohol counselling are within GP scope."),
    mx("driving-sport-safety", "Advise about driving restrictions and notify AUSTROADS requirements", ["driving", "licence", "austroads", "fitness to drive", "vehicle", "sports"], 2, "Syncope with a cardiac cause requires notification to the relevant authority and driving cessation pending cardiology review per AUSTROADS/Vic Roads guidelines.")
   ],
   examinerNotes: "This case is hard because the stem gives only 'blacked out' and the default candidate assumption is vasovagal syncope or dehydration - both of which the patient actively promotes. The critical pivot is eliciting the absence of prodrome, the precise exertional timing (mid-Valsalva, not post-exertion) and the family history (sibling sudden death, father with cardiomegaly). The dynamic cardiac auscultation manoeuvres are the physical examination discriminator - candidates who do not perform Valsalva and squat manoeuvres will hear only a soft murmur and miss its significance. The psychosocial thread is the father's alcohol use disorder - buried in the social history and surfacing as the reason the patient downplays his own symptoms.",
   discriminators: [
    "Elicits the absence of vasovagal prodrome (no nausea, no greying vision) and identifies this as abnormal for a young person",
    "Establishes precise timing - syncope during peak exertion, not post-exertion, which distinguishes outflow obstruction from vasovagal or orthostatic mechanisms",
    "Asks about family history of sudden death or cardiomyopathy and elicits the sibling death and father's 'thick heart'",
    "Performs dynamic auscultation with Valsalva and squat - and correctly interprets a murmur that worsens with Valsalva as consistent with LVOT obstruction",
    "Does NOT reassure the patient that this was probably dehydration or clear him for return to training without cardiological assessment",
    "Addresses the father's alcohol use disorder as a distinct clinical and psychosocial management item"
   ],
   doubleCheck: [
    "AUSTROADS fitness-to-drive guidelines for cardiac syncope: confirm current criteria for driving cessation and notification obligations in Victoria.",
    "HCM risk stratification and ICD implantation thresholds: use the current ESC HCM guidelines and involve cardiologist; risk calculators should not be applied by GP alone.",
    "Sports participation restriction recommendations: check Sports Cardiology Australia and CSANZ position statements for current guidance.",
    ...commonDoubleCheck
   ]
  },

  // ── NEW HARD CASE 4 ── Dysphagia ─────────────────────────────────────────
  {
   id: "dysphagia-pharyngeal-022",
   title: "Food Getting Stuck",
   presentation: "Dysphagia",
   frameworkId: "fatigue",
   setting: "GP",
   difficulty: "hard",
   hidden: true,
   stem: "A 58-year-old woman presents to your GP clinic saying food keeps getting stuck.",
   finalDiagnosis: "Postcricoid squamous cell carcinoma in the context of Plummer-Vinson syndrome",
   diagnosisAliases: ["postcricoid carcinoma", "hypopharyngeal cancer", "Plummer-Vinson syndrome", "pharyngeal carcinoma", "Patterson-Kelly syndrome", "sideropenic dysphagia"],
   recording: [
    "She says it started with solids about four months ago and has recently begun happening with thick fluids too.",
    "She attributes it to rushing meals since taking on more shifts after her husband left last year.",
    "She looks pale and tired; her nails catch your eye - they are flat and slightly spoon-shaped.",
    "She has not told anyone about the swallowing difficulty because she does not want to make a fuss."
   ],
   ddx: {
    must: [
     ddx("Oesophageal or pharyngeal malignancy", "Progressive dysphagia from solids to liquids over months in a middle-aged woman is cancer until proven otherwise.", true, ["oesophageal cancer", "pharyngeal cancer", "hypopharyngeal carcinoma", "head and neck cancer"]),
     ddx("Plummer-Vinson syndrome", "Chronic iron deficiency anaemia plus postcricoid dysphagia plus koilonychia in a middle-aged woman is the defining triad; carries pre-malignant risk.", true, ["Plummer-Vinson", "Patterson-Kelly", "sideropenic dysphagia", "pharyngeal web"]),
     ddx("Peptic stricture or Barrett oesophagus", "Longstanding GORD can cause progressive dysphagia through fibrotic stricture formation.", true, ["peptic stricture", "GORD stricture", "Barrett oesophagus", "oesophageal stricture"]),
     ddx("Achalasia", "Progressive dysphagia to both solids and liquids from onset, regurgitation and weight loss.", true, ["achalasia", "oesophageal dysmotility"]),
     ddx("Extrinsic compression - thyroid mass or lymphadenopathy", "A goitre or malignant nodes can compress the pharynx or oesophagus.", true, ["goitre", "thyroid", "lymphadenopathy", "external compression"])
    ],
    bonus: [
     ddx("Oropharyngeal dysphagia from neurological cause", "Stroke, MND or myasthenia can present as dysphagia - less likely here without neurological symptoms."),
     ddx("Globus pharyngeus", "A sensation of throat fullness without true obstruction; diagnosis of exclusion after structural pathology is excluded.")
    ]
   },
   history: [
    item("h-dysphagia-progression", "Progression: solids only, then liquids - time course and what exactly gets stuck", "Started with bread and meat four months ago; now thick soups also catch. She feels it stick at the level of her throat, not her chest. No food coming back up, no coughing on liquids.", ["dysphagia progression", "solids then liquids", "progressive dysphagia", "what sticks", "where sticks", "throat level", "regurgitation", "coughing on food"], 3, "Progressive dysphagia from solids to liquids over months is the pattern of mechanical obstruction - luminal narrowing from malignancy or stricture. Localisation to the throat rather than the chest points to a pharyngeal or hypopharyngeal lesion rather than an oesophageal one.", ["gi", "malignancy"], "hopc"),
    item("h-weight-appetite", "Weight loss, appetite and systemic symptoms", "She has lost approximately 5 kg over four months. Appetite is preserved but eating less because of fear of choking. Night sweats two to three times per week.", ["weight loss", "appetite", "night sweats", "constitutional", "systemic", "fever", "eating less"], 3, "Unintentional weight loss plus night sweats in the context of dysphagia is a dual red flag - raises malignancy and must not be attributed to reduced caloric intake alone.", ["malignancy", "constitutional"], "redflag"),
    item("h-iron-symptoms", "Iron deficiency symptoms: fatigue, cold intolerance, nail changes, mouth soreness", "Profound fatigue for over a year. She noticed her nails have become flat and spoon-shaped. Angular mouth cracks. Cold hands. No pica.", ["fatigue", "iron deficiency", "koilonychia", "nails", "angular cheilitis", "cold intolerance", "pica", "anaemia symptoms", "mouth sores"], 3, "Koilonychia (spoon nails) and angular cheilitis are classical iron deficiency signs. In this clinical context - middle-aged woman with progressive postcricoid dysphagia - they complete the Plummer-Vinson triad and must be elicited proactively.", ["anaemia", "malabsorption"], "systems"),
    item("h-voice-pain", "Voice change, throat pain, ear pain, otalgia", "Mild voice hoarseness over the past six weeks. Occasional right-sided ear pain she thought was an ear infection. No odynophagia.", ["voice change", "hoarseness", "hoarse", "dysphonia", "ear pain", "otalgia", "throat pain", "odynophagia"], 3, "Hoarseness suggests recurrent laryngeal nerve involvement or direct laryngeal extension. Referred otalgia (via Arnold's nerve) is a red flag for pharyngeal or laryngeal malignancy even without ear pathology.", ["malignancy"], "redflag"),
    item("h-gord-habits", "GORD symptoms, alcohol use, smoking and diet history", "Occasional heartburn for years but no alarm features previously. Non-smoker. Rarely drinks. No betel nut use.", ["gord", "heartburn", "reflux", "smoking", "alcohol", "tobacco", "betel nut", "risk factors", "oesophageal risk"], 2, "GORD is a risk factor for peptic stricture and Barrett; non-smoking is relevant because squamous hypopharyngeal carcinoma without tobacco/alcohol is unusual and points toward Plummer-Vinson as the driving risk factor.", ["gi"], "background"),
    item("h-psychosocial-separation", "Home environment, social support, stressors and financial situation since separation", "Her husband left fourteen months ago and she has been working double shifts to cover the mortgage. She has not told her adult children because she does not want to worry them. She denies depression but cries when describing the past year.", ["separation", "husband left", "social support", "stress", "financial", "carer", "isolation", "emotional", "depression", "psychosocial"], 3, "The separation and financial stress have driven symptom minimisation ('rushing meals') and avoidance of health care for over a year. This thread explains the presentation delay - a critical quality-of-care and cultural communication issue.", ["psychosocial"], "psychosocial"),
    item("h-family-history-cancer", "Family history of head and neck, oesophageal or GI cancer", "No known family history of oesophageal or head and neck cancer. Mother had breast cancer.", ["family history", "oesophageal cancer", "head and neck cancer", "gi cancer", "family cancer"], 1, "Family history is less informative here than the phenotypic triad, but should be elicited as part of a systematic approach.", ["malignancy"], "family")
   ],
   examination: [
    item("ex-vitals-dysphagia", "Vital signs and weight", "Weight 61 kg (down from 66 kg four months ago documented at pharmacist). BP 118/74. HR 88. Afebrile. SpO2 98%.", ["vitals", "weight", "bmi", "blood pressure", "temperature", "weight loss objective"], 3, "Documenting objective weight loss strengthens the red flag case and changes urgency of referral.", ["malignancy", "anaemia"], "cardiovascular"),
    item("ex-koilonychia-pallor", "Nails, skin, conjunctivae and mouth", "Koilonychia present both hands. Conjunctival pallor. Angular cheilitis. Atrophic glossitis.", ["koilonychia", "nails", "pallor", "conjunctiva", "angular cheilitis", "glossitis", "atrophic glossitis", "iron deficiency signs"], 3, "Koilonychia, pallor and glossitis complete the Plummer-Vinson triad on examination. Candidates who only note 'pale' without examining nails and mouth will miss the syndrome.", ["anaemia", "malabsorption"], "general"),
    item("ex-neck", "Neck examination: lymph nodes, thyroid and carotid", "Single palpable right level II cervical lymph node, firm and non-tender, approximately 1.5 cm. Thyroid not enlarged.", ["neck exam", "lymph nodes", "cervical lymph node", "thyroid", "neck palpation", "lymphadenopathy"], 3, "A firm, non-tender cervical lymph node in this clinical context must be presumed malignant until proven otherwise - level II nodal involvement suggests oropharyngeal or hypopharyngeal primary.", ["malignancy"], "neck"),
    item("ex-oral-pharynx", "Oral and oropharyngeal inspection", "No oropharyngeal lesion visible. Posterior pharynx appears normal on inspection. Voice is mildly hoarse.", ["oral exam", "mouth", "pharynx", "oropharynx", "throat", "inspect throat", "voice", "hoarseness"], 2, "Visible oral lesions or oropharyngeal abnormalities prompt immediate ENT referral; a normal oropharyngeal view does not exclude hypopharyngeal or postcricoid pathology.", ["malignancy"], "oral")
   ],
   investigations: [
    ix("fbe-iron-dysphagia", "FBE and iron studies", "Hb 88 g/L microcytic. Ferritin 4 μg/L. Transferrin saturation 6%.", ["fbe", "haemoglobin", "iron studies", "ferritin", "iron deficiency anaemia", "mcv", "haematology"], "bloods", 3, "Profound iron deficiency anaemia confirms the haematological component of Plummer-Vinson and must be documented before any procedural intervention.", ["anaemia"]),
    ix("urgent-ent", "Urgent ENT or head and neck surgery referral - same-week, two-week wait pathway", ["ent referral", "head and neck", "urgent referral", "two week wait", "ear nose throat", "specialist", "otolayrngology"], "special", 3, "Progressive dysphagia plus cervical lymphadenopathy plus hoarseness mandates same-week urgent specialist review under the two-week-wait cancer pathway. Do not wait for investigations to refer.", ["malignancy"]),
    ix("ct-neck-chest", "CT neck, chest and abdomen with contrast for staging", "CT confirms postcricoid mass with right level II nodal involvement. No distant metastases.", ["ct neck", "ct chest", "ct staging", "contrast ct", "imaging staging", "head and neck ct"], "imaging", 3, "CT staging determines whether the disease is resectable and guides MDT planning; this is arranged in parallel with or following ENT assessment.", ["malignancy", "imaging"]),
    ix("oes-pharyngoscopy", "Endoscopy or pharyngoscopy under GA", "Postcricoid lesion identified; biopsy confirms squamous cell carcinoma.", ["endoscopy", "pharyngoscopy", "laryngoscopy", "oga", "biopsy", "tissue diagnosis", "flexible laryngoscopy"], "special", 3, "Tissue diagnosis is required before definitive oncological treatment; this occurs in the specialist setting, not GP.", ["malignancy"]),
    ix("iron-replace-pre", "Commence iron replacement pre-procedurally and optimise for anaesthesia", "IV iron ordered given severity of deficiency.", ["iron replacement", "iron infusion", "oral iron", "pre-operative", "iv iron", "ferric carboxymaltose"], "bloods", 2, "Correcting severe iron deficiency improves perioperative haemoglobin and reduces transfusion risk during major head and neck surgery."),
    ix("u-se-lft-coag", "UEC, LFTs, coagulation, group and hold", "Renal and hepatic function normal. Coagulation normal.", ["uec", "renal function", "lft", "coagulation", "coag", "inr", "group and hold", "baseline bloods"], "bloods", 1, "Pre-procedural baseline; normal results confirm fitness for general anaesthesia and surgical intervention.")
   ],
   management: [
    mx("urgent-ent-ref", "Same-week ENT or head and neck surgical referral - use two-week-wait cancer pathway", ["ent referral", "urgent referral", "two week wait", "cancer pathway", "head and neck referral", "same week"], 3, "This is the most urgent management step. Do not wait for iron studies or imaging results to initiate referral when the clinical picture is this compelling. Delayed diagnosis of postcricoid carcinoma significantly worsens prognosis."),
    mx("iron-replacement-mgmt", "Commence iron replacement: oral iron first-line, IV iron if severe or procedure imminent", ["iron replacement", "oral iron", "iv iron", "ferric carboxymaltose", "ferrous sulphate", "iron deficiency treatment"], 3, "Iron replacement is both therapeutic (for the deficiency) and potentially reduces mucosal dysplasia risk; it optimises the patient for surgery."),
    mx("nutrition-support", "Arrange speech pathology and dietitian review for dysphagia and nutrition", ["speech pathology", "dietitian", "nutrition", "dysphagia management", "modified diet", "swallowing", "nasogastric"], 2, "Progressive dysphagia carries aspiration and malnutrition risk; active nutrition support is a safety priority pending definitive treatment."),
    mx("psychosocial-separation-mgmt", "Address the separation, financial stress and isolation - offer GP mental health plan, social worker, and explicitly check in on her wellbeing", ["mental health plan", "social worker", "depression", "separation", "financial stress", "psychosocial", "wellbeing", "isolation"], 3, "This patient has been minimising and deferring care for over a year because of social circumstances. Addressing the underlying stressor is as important as the cancer pathway for engagement with care."),
    mx("safeguard-disclosure", "Explain the findings clearly and without minimising - involve family with consent", ["explain diagnosis", "communication", "family", "consent", "disclosure", "breaking bad news", "support"], 2, "Patients who have been deferring care due to social isolation often need explicit permission and support to engage their family network."),
    mx("safety-net-dysphagia", "Safety-net urgent review for complete dysphagia, aspiration, haemoptysis or rapid weight loss", ["safety net", "complete dysphagia", "aspiration", "haemoptysis", "urgent review", "worsening"], 2, "While specialist review is pending, the patient must know which symptoms demand immediate emergency care.")
   ],
   examinerNotes: "This is a hard case because the stem gives only 'food getting stuck' and the patient has been attributing her progressive dysphagia to rushing meals for four months. The diagnosis is a postcricoid squamous cell carcinoma arising on a background of Plummer-Vinson syndrome. Most candidates will identify malignancy as a differential but will not connect the koilonychia, anaemia and postcricoid dysphagia into the Plummer-Vinson triad. Critical failures to watch for: (1) not examining nails and mouth carefully enough to find koilonychia and glossitis, (2) not asking about hoarseness and referred otalgia as malignancy red flags, (3) not palpating the neck and finding the lymph node, (4) waiting for investigation results before making an urgent ENT referral, (5) not addressing the psychosocial thread. The psychosocial thread - separation, financial stress, isolation and symptom minimisation - runs through the whole case and directly explains the four-month delay.",
   discriminators: [
    "Elicits the precise progression from solids to liquids and localises the obstruction to the pharyngeal/throat level rather than the chest",
    "Proactively asks about koilonychia, angular cheilitis and glossitis - and examines for them - connecting them to iron deficiency and the Plummer-Vinson triad",
    "Asks about hoarseness and referred otalgia as red flags for pharyngeal malignancy",
    "Palpates the neck and identifies the cervical lymph node as a presumed malignant finding",
    "Initiates urgent ENT referral on clinical grounds without waiting for investigation results to come back",
    "Names the psychosocial driver (separation and financial stress) and addresses it as a distinct management item rather than just noting it"
   ],
   doubleCheck: [
    "Two-week-wait cancer referral pathways in Victoria: confirm current HealthPathways criteria for urgent head and neck cancer referral.",
    "Plummer-Vinson syndrome is associated with a significantly elevated risk of postcricoid and pharyngeal carcinoma; iron replacement alone does not eliminate this risk - specialist surveillance is required.",
    "IV iron dosing (ferric carboxymaltose) should be checked against current eTG Haematology chapter.",
    ...commonDoubleCheck
   ]
  }
 ];

 const SCBD_INSPECTION_FINDINGS = {
  "cp-acs-001": "On inspection, the patient looks pale, clammy and uncomfortable, sitting still with a hand over the central chest.",
  "sob-pe-002": "On inspection, the patient looks anxious and breathless at rest, sitting forward and speaking in short sentences.",
  "abdo-ectopic-003": "On inspection, the patient looks pale, anxious and uncomfortable, with guarded movement because of lower abdominal pain.",
  "headache-sah-004": "On inspection, the patient looks severely distressed, photophobic and nauseated, preferring to lie still.",
  "fatigue-crc-005": "On inspection, the patient looks tired and pale but is not acutely distressed.",
  "falls-orthostatic-006": "On inspection, the patient appears frail and cautious when standing, with minor bruising from recent falls.",
  "bowel-crc-007": "On inspection, the patient looks mildly pale and tired, without acute distress or obvious cachexia.",
  "constipation-parkinson-008": "On inspection, the patient has reduced facial expression, reduced blink rate and a slightly stooped posture.",
  "palp-thyroid-af-009": "On inspection, the patient looks anxious, warm and sweaty, with visible fine tremor and weight loss.",
  "back-cauda-010": "On inspection, the patient looks very uncomfortable, moves cautiously and struggles to stand fully upright.",
  "fever-pyelo-sepsis-011": "On inspection, the patient looks unwell, flushed, rigoring and dehydrated.",
  "dizzy-stroke-012": "On inspection, the patient looks nauseated and unsafe sitting unsupported, with visible imbalance.",
  "cough-pneumonia-013": "On inspection, the patient looks unwell and breathless, splinting the right side with pleuritic pain.",
  "polyuria-diabetes-014": "On inspection, the patient looks thirsty with dry mucous membranes and mild dehydration.",
  "mood-suicide-015": "On inspection, the patient has poor eye contact, slowed movements and a tearful, withdrawn affect.",
  "vomit-dka-016": "On inspection, the patient looks very unwell, dehydrated and is breathing deeply with a Kussmaul pattern.",
  "fatigue-variceal-017": "On inspection, the patient looks pale and fatigued with subtle jaundice and chronic liver disease stigmata.",
  "chest-pericarditis-018": "On inspection, the patient looks uncomfortable and prefers to sit forward because lying flat worsens the pain.",
  "fever-endocarditis-019": "On inspection, the patient looks febrile and unwell, with visible track marks and a tired appearance.",
  "cough-aspiration-stroke-020": "On inspection, the patient looks unwell, breathless and confused, with a wet cough and subtle dysarthria.",
  "palp-phaeochromocytoma-001": "On inspection, the patient looks well at rest but pale under closer inspection, with a concealer-covered bruise visible on the left forearm.",
  "wl-coeliac-001": "On inspection, the patient looks thin and mildly pale, with flat spoon-shaped nails and angular cracks at the corners of his mouth.",
  "syncope-hcm-021": "On inspection, the patient is a well-built young man who appears well at rest with no acute distress.",
  "dysphagia-pharyngeal-022": "On inspection, the patient looks pale and tired, with noticeably spoon-shaped nails and subtle angular cheilitis."
 };

 const SCBD_VITAL_FINDINGS = {
  "falls-orthostatic-006": "T 36.7, HR 74 lying and 88 standing, BP 138/76 lying and 102/62 standing, RR 14, SpO2 98% room air.",
  "constipation-parkinson-008": "T 36.6, HR 72, BP 132/78, RR 14, SpO2 98% room air.",
  "back-cauda-010": "T 36.8, HR 92, BP 145/86, RR 18, SpO2 99% room air.",
  "mood-suicide-015": "T 36.6, HR 76, BP 118/72, RR 14, SpO2 99% room air.",
  "palp-phaeochromocytoma-001": "T 36.8, HR 88 regular, BP right arm 158/98 left arm 156/96, RR 14, SpO2 99% room air.",
  "wl-coeliac-001": "Weight 61 kg (down from 67 kg). BMI 19.2. BP 100/62, HR 82, afebrile, SpO2 99% room air.",
  "syncope-hcm-021": "HR 62 regular. BP 118/76 sitting 116/74 standing. SpO2 99%. Afebrile.",
  "dysphagia-pharyngeal-022": "Weight 61 kg (down from 66 kg). BP 118/74, HR 88, afebrile, SpO2 98% room air."
 };

 function examText(item) {
  return [item.id, item.label, item.answer, ...(item.keywords || [])].join(" ").toLowerCase();
 }

 function hasVitalSigns(caseData) {
  return (caseData.examination || []).some(entry => /vital|observ/.test([entry.id, entry.label].join(" ").toLowerCase()));
 }

 function addCoreExaminationItems(cases) {
  for (const caseData of cases) {
   caseData.examination = Array.isArray(caseData.examination) ? caseData.examination : [];
   const additions = [];
   if (!caseData.examination.some(entry => entry.id === "general-inspection")) {
    additions.push(item(
     "general-inspection",
     "General inspection / first look",
     SCBD_INSPECTION_FINDINGS[caseData.id] || "On inspection, note the patient's general appearance, distress, work of breathing, colour, hydration and ability to engage.",
     ["inspection", "inspect", "first look", "general appearance", "appearance", "look", "looks", "how do they look", "unwell", "distress", "pale", "pallor", "work of breathing", "tripod", "tripodding"],
     2,
     "The first look is a score-bearing safety step: it identifies distress, pallor, respiratory effort, dehydration, delirium and other instability before focused system examination.",
     ["vitals"],
     "exam",
     "inspection"
    ));
   }
   if (!hasVitalSigns(caseData)) {
    additions.push(item(
     "vitals",
     "Vital signs",
     SCBD_VITAL_FINDINGS[caseData.id] || "Vital signs are available and should be requested explicitly.",
     ["vitals", "vital signs", "observations", "obs", "blood pressure", "bp", "heart rate", "hr", "pulse", "respiratory rate", "rr", "temperature", "sats", "spo2", "oxygen saturation"],
     2,
     "Vital signs are a score-bearing safety step because they separate stable presentations from shock, hypoxia, sepsis physiology and other immediate escalation triggers.",
     ["vitals"],
     "exam",
     "vitals"
    ));
   }
   caseData.examination = [...additions, ...caseData.examination];
  }
 }

 addCoreExaminationItems(SCBD_CASES);

 window.SCBD_REFERENCES = SCBD_REFERENCES;
 window.SCBD_FRAMEWORKS = SCBD_FRAMEWORKS;
 window.SCBD_CASES = SCBD_CASES;
})();
