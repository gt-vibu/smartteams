-- Evidence is uploaded before the leave form is submitted. Keep draft evidence
-- scoped to an employee until submission atomically claims it for a request.
ALTER TABLE public.file_objects DROP CONSTRAINT file_objects_leave_attachment_check;
ALTER TABLE public.file_objects ADD CONSTRAINT file_objects_leave_attachment_check
  CHECK (purpose <> 'LEAVE_ATTACHMENT'::public."FilePurpose"
    OR leave_request_id IS NOT NULL OR employee_id IS NOT NULL);
