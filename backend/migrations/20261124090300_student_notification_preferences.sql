BEGIN;

CREATE TABLE IF NOT EXISTS public.student_notification_preference (
    student_id bigint PRIMARY KEY REFERENCES public.student(student_id) ON DELETE CASCADE,
    appointment_alerts boolean NOT NULL DEFAULT true,
    pathway_updates boolean NOT NULL DEFAULT true
);

ALTER TABLE public.student_notification_preference ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.student_notification_preference FROM PUBLIC;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON public.student_notification_preference FROM anon;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON public.student_notification_preference FROM authenticated;
    END IF;
END
$$;

-- Existing appointment producers continue notifying advisors. Only students
-- with an explicit opt-out have the corresponding notification suppressed.
CREATE OR REPLACE FUNCTION public.filter_student_notification() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
    IF NEW.notification_type IN ('appointment', 'pathway_update') AND EXISTS (
        SELECT 1 FROM public.student_notification_preference p
        WHERE p.student_id = NEW.user_id
          AND ((NEW.notification_type = 'appointment' AND NOT p.appointment_alerts)
            OR (NEW.notification_type = 'pathway_update' AND NOT p.pathway_updates))
    ) THEN
        RETURN NULL;
    END IF;
    RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS student_notification_preference_filter ON public.notification;
CREATE TRIGGER student_notification_preference_filter
    BEFORE INSERT ON public.notification
    FOR EACH ROW EXECUTE FUNCTION public.filter_student_notification();

-- Both career assessments and advisor quizzes save a result in quiz_attempt.
-- This runs once per new result and leaves existing attempts and inbox rows intact.
CREATE OR REPLACE FUNCTION public.notify_student_quiz_result() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
    INSERT INTO public.notification (user_id, message, notification_type, is_read)
    VALUES (NEW.student_id, 'Your quiz results are ready. Open Pathway Quiz to review your results and related pathways.',
            'pathway_update', false);
    RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS student_quiz_result_notification ON public.quiz_attempt;
CREATE TRIGGER student_quiz_result_notification
    AFTER INSERT ON public.quiz_attempt
    FOR EACH ROW WHEN (NEW.assessment_result IS NOT NULL AND NEW.student_id IS NOT NULL)
    EXECUTE FUNCTION public.notify_student_quiz_result();

COMMIT;
