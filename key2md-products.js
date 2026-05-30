(function () {
 var PRODUCTS = [
 {
 id: 'casper_class',
 area: 'CASPer',
 title: 'Final Friday CASPer class',
 price: '$120',
 href: 'casper-class.html',
 cta: 'Register for the final class',
 bestFor: 'Students aiming for the June 11 CASPer who want one last live pass through Dan\'s realistic tutoring stations.',
 tags: ['casper', 'uow', 'notre dame', 'class', 'june']
 },
 {
 id: 'casper_masterclass',
 area: 'CASPer',
 title: 'CASPer Masterclass',
 price: '$300',
 href: 'casper-masterclass.html',
 cta: 'Register for June 11',
 bestFor: 'Students sitting the June 11 CASPer who want a final exam-day reset with key points fresh and clear.',
 tags: ['casper', 'masterclass', 'june', 'exam day']
 },
 {
 id: 'casper_pro',
 area: 'CASPer',
 title: 'CASPer Pro',
 price: '$40/week',
 href: 'plans.html#pro-section',
 cta: 'Start CASPer Pro',
 bestFor: 'High-volume practice where the daily free AI review becomes the bottleneck.',
 tags: ['casper', 'practice', 'q4', 'pro']
 },
 {
 id: 'casper_credits',
 area: 'CASPer',
 title: 'CASPer AI credits',
 price: 'from $7',
 href: 'plans.html#credits',
 cta: 'Buy CASPer credits',
 bestFor: 'Occasional score checks without a subscription.',
 tags: ['casper', 'credits', 'pay as you go']
 },
 {
 id: 'expert_marking',
 area: 'Human feedback',
 title: 'Expert marking by Dan',
 price: '$35/response',
 href: 'practice.html',
 cta: 'Submit a response',
 bestFor: 'When AI keeps flagging the same issue and you need a human read on nuance.',
 tags: ['human', 'marking', 'casper', 'feedback']
 },
 {
 id: 'full_mock',
 area: 'CASPer',
 title: 'Full CASPer mock exam',
 price: 'from $59',
 href: 'full-casper-mock-exam.html',
 cta: 'View full mock',
 bestFor: 'Students close to test day who need full-test stamina, no-repeat mocks, and optional equity access timing.',
 tags: ['casper', 'mock', 'exam']
 },
 {
 id: 'mmi_pro',
 area: 'MMI',
 title: 'MMI feedback',
 price: 'from $5/review',
 href: 'plans.html#mmi-section',
 cta: 'Compare MMI options',
 bestFor: 'Applicants whose written profile is competitive and now need interview conversion.',
 tags: ['mmi', 'interview', 'voice', 'transcript']
 },
 {
 id: 'mmi_masterclass',
 area: 'MMI',
 title: 'MMI Masterclass',
 price: '$400',
 href: 'mmi-masterclass.html',
 cta: 'Register for MMI masterclass',
 bestFor: 'Applicants who want a live, structured pass through examiner expectations, station types, and authentic communication around very early September interview-release timing.',
 tags: ['mmi', 'masterclass', 'interview']
 },
 {
 id: 'gamsat_s2_pro',
 area: 'GAMSAT S2',
 title: 'GAMSAT S2 feedback',
 price: 'from $12/review',
 href: 'gamsat-s2-practice.html',
 cta: 'Practise Section II',
 bestFor: 'Applicants whose strategy depends on lifting written score or essay consistency.',
 tags: ['gamsat', 's2', 'essay']
 },
 {
 id: 'preference_discussion',
 area: 'Strategy',
 title: '15-minute preferences discussion',
 price: '$75',
 href: 'booking.html?type=intro',
 cta: 'Pay $75 and request times',
 bestFor: 'When you want Dan to sanity-check your chances, preference order, or edge-case admissions rules before GEMSAS closes.',
 tags: ['strategy', 'call', 'preference']
 }
 ];

 function byId(id) {
 return PRODUCTS.find(function (p) { return p.id === id; }) || null;
 }

 function textFromPlan(plan) {
 if (!plan) return '';
 return [
 plan.mode,
 plan.summary,
 plan.focus,
 plan.nextStep,
 (plan.watchouts || []).join(' '),
 (plan.strongest || []).map(function (s) { return s.name + ' ' + s.detail; }).join(' ')
 ].join(' ').toLowerCase();
 }

 function addUnique(list, id, reason) {
 if (list.some(function (item) { return item.id === id; })) return;
 var product = byId(id);
 if (product) list.push(Object.assign({ reason: reason }, product));
 }

 function recommend(context) {
 context = context || {};
 var plan = context.plan || null;
 var progress = context.progress || {};
 var text = textFromPlan(plan);
 var count = Number(progress.count || 0);
 var avg = Number(progress.avgScore || 0);
 var plateau = !!progress.plateau;
 var recs = [];

 if (/uow|notre|und|casper|q4/.test(text)) {
 addUnique(recs, 'casper_class', 'Your latest admissions read is CASPer-sensitive, so live review has high leverage.');
 addUnique(recs, count >= 5 || avg < 7 ? 'casper_pro' : 'casper_credits', count >= 5 ? 'You are doing enough reps that the daily free cap will slow you down.' : 'Use paid checks only when a response needs scoring.');
 }

 if (/mmi|interview/.test(text)) {
 addUnique(recs, 'mmi_pro', 'Your written profile is less likely to be the bottleneck than interview conversion.');
 }

 if (/gamsat|section ii|essay|s2/.test(text)) {
 addUnique(recs, 'gamsat_s2_pro', 'Your plan mentions written-score improvement, so essay feedback is the direct lever.');
 }

 if (plateau || (count >= 8 && avg && avg < 7.5)) {
 addUnique(recs, 'expert_marking', 'Your AI pattern suggests a human read would be useful before doing more volume.');
 }

 if (count >= 8 && /casper/.test(text)) {
 addUnique(recs, 'full_mock', 'You have enough reps for a full-test rehearsal to reveal stamina and pacing issues.');
 }

 if (!recs.length) {
 addUnique(recs, 'preference_discussion', 'No saved strategy yet, so the safest next step is a focused preference sanity-check.');
 addUnique(recs, 'casper_credits', 'A low-commitment way to test the feedback loop before subscribing.');
 }

 return recs.slice(0, 4);
 }

 window.Key2MDProducts = {
 all: PRODUCTS,
 byId: byId,
 recommend: recommend
 };
})();
