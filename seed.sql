-- Seed data for Community Hero AI

INSERT OR IGNORE INTO users (id, name, email, role, score) VALUES
  (1, 'Demo Citizen', 'demo@communityhero.ai', 'citizen', 340),
  (2, 'Alice Johnson', 'alice@example.com', 'citizen', 120),
  (3, 'Bob Smith', 'bob@example.com', 'citizen', 75);

-- Staff accounts (password-protected).
-- Super-admin (City Operations) — triages and ASSIGNS issues to authorities.
-- Login: admin@city.gov / Admin@123
INSERT OR IGNORE INTO users (id, name, email, role, department, password_hash) VALUES
  (4, 'City Operations', 'admin@city.gov', 'admin', NULL,
   'b47028230faedb47fdebae92427e5638:24b3aff7aa87131fdae466e9e45f372dd02edac713d9bcff41732ff396a1fbde');

-- Department authorities — each only sees issues assigned to their department.
INSERT OR IGNORE INTO users (id, name, email, role, department, password_hash) VALUES
  (5, 'Road Maintenance Dept', 'roads@city.gov', 'authority', 'Road Maintenance',
   '27e814cda34037f1bd4a14084cdf2f6f:b04583404b06cf4a32f62eabde2015ceedba64d1a3854cd967c7644f57f8f935'),
  (6, 'Sanitation Dept', 'sanitation@city.gov', 'authority', 'Sanitation',
   '75a2e420ccb71aaed82516eb02d7134b:34242a13d10546313d1c2a883e7f6f48d59b3a5ef717237a393c5bfcf306b0b5'),
  (7, 'Electrical Dept', 'electrical@city.gov', 'authority', 'Electrical',
   '8f74344507f8a95def870a2c5fae02d6:4428f2ddc8552b84ae2c96881372b9c3bf554982a073edf5efc963d4fc3c8e19'),
  (8, 'Water Works Dept', 'water@city.gov', 'authority', 'Water Works',
   '0fd8256eac302ef575571c49ffad3693:01f6e2f12fb732368ddd0a2757fef408f1e865b2881ef629ea064a34a258890c'),
  (9, 'Parks & Recreation Dept', 'parks@city.gov', 'authority', 'Parks & Recreation',
   '34daa191688135713b733f3a2e1251d4:1947e6203696bbdcab108dc3da4ea45f6379950916152540fe23e071b2aea73f');

INSERT OR IGNORE INTO issues
  (id, title, description, category, severity, status, department, assigned_to, priority_score, address, lat, lng, ai_summary, ai_source, verify_count, reporter_id)
VALUES
  (1, 'Large pothole near Sector 17 Plaza', 'Deep pothole near the crossing, damaging tyres.', 'Pothole', 5, 'In Progress', 'Road Maintenance', 5, 92.0, 'Sector 17, Chandigarh', 30.7415, 76.7822, 'Critical road hazard. Deep pothole poses risk to vehicles and cyclists. Recommend immediate patch.', 'heuristic', 7, 1),
  (2, 'Illegal dumping behind Sector 23 market', 'Pile of construction debris dumped behind the market.', 'Illegal Dumping', 4, 'Verified', NULL, NULL, 70.0, 'Sector 23, Chandigarh', 30.7449, 76.7693, 'Environmental and safety concern near a public area. Schedule cleanup crew.', 'heuristic', 4, 2),
  (3, 'Broken streetlight in Sector 35', 'Streetlight out for a week, dark intersection at night.', 'Streetlight', 3, 'Reported', NULL, NULL, 55.0, 'Sector 35, Chandigarh', 30.7268, 76.7561, 'Public safety risk after dark. Assign to electrical for bulb/ballast check.', 'heuristic', 2, 3),
  (4, 'Water leak flooding sidewalk in Sector 8', 'Constant water flow flooding the walkway.', 'Water Leak', 4, 'Assigned', 'Water Works', 8, 78.0, 'Sector 8, Chandigarh', 30.7485, 76.7975, 'Potential pipe burst wasting water and creating slip hazard. Dispatch water works.', 'heuristic', 5, 1),
  (5, 'Graffiti on Sector 22 community centre', 'Spray paint covering the front wall.', 'Graffiti', 2, 'Resolved', 'Parks & Recreation', 9, 30.0, 'Sector 22, Chandigarh', 30.7392, 76.7794, 'Cosmetic vandalism. Low urgency; schedule routine cleanup.', 'heuristic', 3, 2);

INSERT OR IGNORE INTO issue_updates (issue_id, status, department, message, author) VALUES
  (1, 'Reported', NULL, 'Issue reported by citizen.', 'System'),
  (1, 'Verified', NULL, 'Confirmed by 5 community members.', 'System'),
  (1, 'In Progress', 'Road Maintenance', 'Crew dispatched, repair scheduled today.', 'City Operations'),
  (4, 'Assigned', 'Water Works', 'Assigned to water works team.', 'City Operations'),
  (5, 'Resolved', 'Parks & Recreation', 'Wall repainted and cleaned.', 'City Operations');

-- Trust-weighted community verifications (proof-of-presence demo data).
-- on_site = verified physically near the issue (counts double); reporters never self-verify.
INSERT OR IGNORE INTO verifications (issue_id, user_id, vote, on_site, distance_m) VALUES
  (1, 2, 'confirm', 1, 140),
  (1, 3, 'confirm', 1, 90),
  (1, 5, 'confirm', 0, NULL),
  (2, 1, 'confirm', 1, 210),
  (2, 3, 'confirm', 1, 60),
  (3, 1, 'confirm', 0, NULL),
  (3, 2, 'confirm', 1, 175),
  (4, 2, 'confirm', 1, 45),
  (4, 3, 'confirm', 1, 130),
  (4, 6, 'confirm', 0, NULL),
  (5, 1, 'confirm', 1, 220),
  (5, 3, 'confirm', 0, NULL);

-- Keep each issue's verify_count consistent with the actual confirm rows.
UPDATE issues
SET verify_count = (SELECT COUNT(*) FROM verifications v WHERE v.issue_id = issues.id AND v.vote = 'confirm')
WHERE id IN (1, 2, 3, 4, 5);

-- Autonomous Triage Agent traces for seeded issues (so the agent's work is
-- visible immediately in the demo without waiting for a fresh report).
UPDATE issues SET agent_processed = 1 WHERE id IN (1, 2, 3, 4, 5);

INSERT OR IGNORE INTO agent_actions (issue_id, step, tool, thought, action, result) VALUES
  (1, 1, 'perceive', 'Gathering context for issue #1.', 'Found 0 open same-category issues; department workload is 1.', 'Context ready.'),
  (1, 2, 'reason', 'Critical road hazard with strong community confirmation; not a duplicate.', 'duplicate_of=none, priority=92, dept=Road Maintenance', 'Reasoning by Gemini.'),
  (1, 3, 'prioritize', 'Severity 5 plus 3 confirmations raises urgency to the top of the queue.', 'Set priority score to 92/100.', 'Priority updated.'),
  (1, 4, 'route', 'Category "Pothole" maps to the Road Maintenance department.', 'Assigned to Road Maintenance Dept; status set to Assigned.', 'Dispatched to department.'),
  (1, 5, 'plan', 'Drafting a field action plan.', '4 steps - crew: 2-3 person road crew - est 2-4 hours, $150-$500.', 'Inspect -> Cordon off -> Apply asphalt -> Compact and seal.'),
  (4, 1, 'perceive', 'Gathering context for issue #4.', 'Found 0 open same-category issues; department workload is 1.', 'Context ready.'),
  (4, 2, 'reason', 'Active pipe burst creating a slip hazard; route urgently.', 'duplicate_of=none, priority=78, dept=Water Works', 'Reasoning by Gemini.'),
  (4, 3, 'prioritize', 'Ongoing water loss and public-safety risk keep priority high.', 'Set priority score to 78/100.', 'Priority updated.'),
  (4, 4, 'route', 'Category "Water Leak" maps to the Water Works department.', 'Assigned to Water Works Dept; status set to Assigned.', 'Dispatched to department.'),
  (4, 5, 'plan', 'Drafting a field action plan.', '4 steps - crew: 3-person water works crew - est 4-8 hours, $400-$1,500.', 'Isolate valve -> Excavate -> Replace section -> Pressure-test.'),
  (3, 1, 'perceive', 'Gathering context for issue #3.', 'Found 0 open same-category issues; department workload is 1.', 'Context ready.'),
  (3, 2, 'reason', 'Dark intersection is a safety risk after dusk; route to Electrical.', 'duplicate_of=none, priority=55, dept=Electrical', 'Reasoning by Gemini.'),
  (3, 3, 'route', 'Category "Streetlight" maps to the Electrical department.', 'Left in queue for admin assignment.', 'Pending manual assignment.');

-- Contractor / Responder account (login: builder@city.gov / Build@123)
INSERT OR IGNORE INTO users (id, name, email, role, password_hash) VALUES
  (20, 'FixIt Civic Works', 'builder@city.gov', 'contractor',
   '3d89ef0f080e6a433a0cdf4ef1db0510:3284753195d462f98f548b51e624d162e64b7f549b5f43301904aff43a20efdf');

-- Bounties on open issues (reward a responder earns for a verified fix).
UPDATE issues SET bounty = severity * 500 WHERE id IN (1, 2, 3, 4, 5);

-- =====================================================================
-- 0009 — Municipal AI Command Center seed data
-- Contractor profiles (RADAR), extra contractors, and SIMULATED budgets.
-- Coordinates are real Chandigarh sectors so the RADAR distance is meaningful.
-- =====================================================================

-- Two additional contractors (reuse the Build@123 hash so they're loginable for demos).
INSERT OR IGNORE INTO users (id, name, email, role, password_hash) VALUES
  (21, 'RoadCare Infra', 'roadcare@city.gov', 'contractor',
   '3d89ef0f080e6a433a0cdf4ef1db0510:3284753195d462f98f548b51e624d162e64b7f549b5f43301904aff43a20efdf'),
  (22, 'AquaFix Services', 'aquafix@city.gov', 'contractor',
   '3d89ef0f080e6a433a0cdf4ef1db0510:3284753195d462f98f548b51e624d162e64b7f549b5f43301904aff43a20efdf'),
  (23, 'BrightVolt Electricals', 'brightvolt@city.gov', 'contractor',
   '3d89ef0f080e6a433a0cdf4ef1db0510:3284753195d462f98f548b51e624d162e64b7f549b5f43301904aff43a20efdf');

-- Contractor RADAR profiles (skills/rating/availability are SIMULATED demo data).
INSERT OR IGNORE INTO contractors (user_id, company, skills, rating, jobs_completed, availability, active_tasks, lat, lng, base_address) VALUES
  (20, 'FixIt Civic Works',      'Pothole,Graffiti,Other',     4.6, 128, 'available', 2, 30.7410, 76.7820, 'Sector 17, Chandigarh'),
  (21, 'RoadCare Infra',         'Pothole,Water Leak',         4.8, 96,  'available', 1, 30.7280, 76.7600, 'Sector 35, Chandigarh'),
  (22, 'AquaFix Services',       'Water Leak,Streetlight',     4.3, 54,  'busy',      4, 30.7490, 76.7980, 'Sector 8, Chandigarh'),
  (23, 'BrightVolt Electricals', 'Streetlight,Other',          4.5, 73,  'available', 0, 30.7330, 76.7790, 'Sector 34, Chandigarh');

-- Simulated departmental budgets (FY 2024-25, INR).
INSERT OR IGNORE INTO budgets (department, fiscal_year, allocated, spent, committed) VALUES
  ('Road Maintenance',    '2024-25', 5000000, 1850000, 320000),
  ('Sanitation',          '2024-25', 3000000, 1200000, 0),
  ('Electrical',          '2024-25', 2000000,  640000, 80000),
  ('Water Works',         '2024-25', 4000000, 2100000, 150000),
  ('Parks & Recreation',  '2024-25', 1500000,  410000, 0),
  ('General Services',    '2024-25', 1000000,  220000, 0);

-- A few sample quotations on issue #2 (illegal dumping) so the comparison panel is populated.
INSERT OR IGNORE INTO quotations (id, issue_id, contractor_id, est_cost, est_days, past_rating, status) VALUES
  (1, 2, 20, 18000, 1.5, 4.6, 'submitted'),
  (2, 2, 21, 16000, 3.0, 4.8, 'submitted'),
  (3, 2, 23, 24000, 2.0, 4.5, 'submitted');
