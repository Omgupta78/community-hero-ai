-- Seed data for Community Hero AI

INSERT OR IGNORE INTO users (id, name, email, role, score) VALUES
  (1, 'Demo Citizen', 'demo@communityhero.ai', 'citizen', 340),
  (2, 'Alice Johnson', 'alice@example.com', 'citizen', 120),
  (3, 'Bob Smith', 'bob@example.com', 'citizen', 75),
  (4, 'City Operations', 'ops@city.gov', 'admin', 0);

INSERT OR IGNORE INTO issues
  (id, title, description, category, severity, status, department, priority_score, address, lat, lng, ai_summary, ai_source, verify_count, reporter_id)
VALUES
  (1, 'Large pothole on Main St', 'Deep pothole near the crossing, damaging tires.', 'Pothole', 5, 'In Progress', 'Road Maintenance', 92.0, '123 Main St, Springfield', 39.7990, -89.6440, 'Critical road hazard. Deep pothole poses risk to vehicles and cyclists. Recommend immediate patch.', 'heuristic', 7, 1),
  (2, 'Illegal dumping behind park', 'Pile of construction debris dumped behind the playground.', 'Illegal Dumping', 4, 'Verified', 'Sanitation', 70.0, 'Lincoln Park, Springfield', 39.8010, -89.6500, 'Environmental and safety concern near a public play area. Schedule cleanup crew.', 'heuristic', 4, 2),
  (3, 'Broken streetlight', 'Streetlight out for a week, dark intersection at night.', 'Streetlight', 3, 'Reported', NULL, 55.0, '5th & Oak Ave, Springfield', 39.7950, -89.6480, 'Public safety risk after dark. Assign to electrical for bulb/ballast check.', 'heuristic', 2, 3),
  (4, 'Water leak flooding sidewalk', 'Constant water flow flooding the walkway.', 'Water Leak', 4, 'Assigned', 'Water Works', 78.0, '88 River Rd, Springfield', 39.8030, -89.6390, 'Potential pipe burst wasting water and creating slip hazard. Dispatch water works.', 'heuristic', 5, 1),
  (5, 'Graffiti on community center', 'Spray paint covering the front wall.', 'Graffiti', 2, 'Resolved', 'Parks & Recreation', 30.0, '12 Center St, Springfield', 39.7975, -89.6520, 'Cosmetic vandalism. Low urgency; schedule routine cleanup.', 'heuristic', 3, 2);

INSERT OR IGNORE INTO issue_updates (issue_id, status, department, message, author) VALUES
  (1, 'Reported', NULL, 'Issue reported by citizen.', 'System'),
  (1, 'Verified', NULL, 'Confirmed by 5 community members.', 'System'),
  (1, 'In Progress', 'Road Maintenance', 'Crew dispatched, repair scheduled today.', 'City Operations'),
  (4, 'Assigned', 'Water Works', 'Assigned to water works team.', 'City Operations'),
  (5, 'Resolved', 'Parks & Recreation', 'Wall repainted and cleaned.', 'City Operations');
