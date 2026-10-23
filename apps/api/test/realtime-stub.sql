CREATE SCHEMA realtime;
CREATE TABLE realtime.test_outbox (
  payload jsonb NOT NULL,
  event text NOT NULL,
  topic text NOT NULL,
  private boolean NOT NULL
);
CREATE FUNCTION realtime.send(
  message_payload jsonb, message_event text, message_topic text, message_private boolean
) RETURNS void LANGUAGE sql AS $stub$
  INSERT INTO realtime.test_outbox (payload, event, topic, private)
  VALUES (message_payload, message_event, message_topic, message_private);
$stub$;
