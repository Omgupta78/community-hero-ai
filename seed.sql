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
  (1, 'Large pothole on Main St', 'Deep pothole near the crossing, damaging tires.', 'Pothole', 5, 'In Progress', 'Road Maintenance', 5, 92.0, '123 Main St, Springfield', 39.7990, -89.6440, 'Critical road hazard. Deep pothole poses risk to vehicles and cyclists. Recommend immediate patch.', 'heuristic', 7, 1),
  (2, 'Illegal dumping behind park', 'Pile of construction debris dumped behind the playground.', 'Illegal Dumping', 4, 'Verified', NULL, NULL, 70.0, 'Lincoln Park, Springfield', 39.8010, -89.6500, 'Environmental and safety concern near a public play area. Schedule cleanup crew.', 'heuristic', 4, 2),
  (3, 'Broken streetlight', 'Streetlight out for a week, dark intersection at night.', 'Streetlight', 3, 'Reported', NULL, NULL, 55.0, '5th & Oak Ave, Springfield', 39.7950, -89.6480, 'Public safety risk after dark. Assign to electrical for bulb/ballast check.', 'heuristic', 2, 3),
  (4, 'Water leak flooding sidewalk', 'Constant water flow flooding the walkway.', 'Water Leak', 4, 'Assigned', 'Water Works', 8, 78.0, '88 River Rd, Springfield', 39.8030, -89.6390, 'Potential pipe burst wasting water and creating slip hazard. Dispatch water works.', 'heuristic', 5, 1),
  (5, 'Graffiti on community center', 'Spray paint covering the front wall.', 'Graffiti', 2, 'Resolved', 'Parks & Recreation', 9, 30.0, '12 Center St, Springfield', 39.7975, -89.6520, 'Cosmetic vandalism. Low urgency; schedule routine cleanup.', 'heuristic', 3, 2);

INSERT OR IGNORE INTO issue_updates (issue_id, status, department, message, author) VALUES
  (1, 'Reported', NULL, 'Issue reported by citizen.', 'System'),
  (1, 'Verified', NULL, 'Confirmed by 5 community members.', 'System'),
  (1, 'In Progress', 'Road Maintenance', 'Crew dispatched, repair scheduled today.', 'City Operations'),
  (4, 'Assigned', 'Water Works', 'Assigned to water works team.', 'City Operations'),
  (5, 'Resolved', 'Parks & Recreation', 'Wall repainted and cleaned.', 'City Operations');
