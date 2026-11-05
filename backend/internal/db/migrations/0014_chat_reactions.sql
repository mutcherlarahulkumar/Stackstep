-- Reactions on chat messages (feature 22). Each side of a conversation (the student, or staff
-- speaking as the persona) can leave each emoji once.
CREATE TABLE chat_reactions (
    message_id uuid NOT NULL REFERENCES chat_messages (id) ON DELETE CASCADE,
    author     text NOT NULL CHECK (author IN ('student', 'persona')),
    emoji      text NOT NULL CHECK (emoji IN ('thumbs_up', 'heart', 'party', 'laugh', 'thinking', 'eyes')),
    created_at timestamptz NOT NULL,
    PRIMARY KEY (message_id, author, emoji)
);
