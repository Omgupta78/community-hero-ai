-- Video-based reporting.
-- photo_data continues to hold a still image (for video reports this is a frame
-- extracted client-side, used for thumbnails + Gemini Vision analysis).
-- video_data holds the playable clip (base64 data URL) for short clips.

ALTER TABLE issues ADD COLUMN media_type TEXT NOT NULL DEFAULT 'image';  -- 'image' | 'video'
ALTER TABLE issues ADD COLUMN video_data TEXT;                            -- base64 data URL of the clip
