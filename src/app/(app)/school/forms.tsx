"use client";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import type { ActionState } from "@/server/actions";

type Action = (p: ActionState, fd: FormData) => Promise<ActionState>;
type Course = { id: string; name: string; code: string | null; term?: string | null; instructorName?: string | null; instructorEmail?: string | null; location?: string | null; meetingInfo?: string | null; url?: string | null };

const KINDS = ["assignment", "exam", "quiz", "project", "reading", "lab", "discussion", "other"];

export function CourseDialog({ action, course, trigger }: { action: Action; course?: Course; trigger: string }) {
  return (
    <Dialog trigger={trigger} title={course ? "Edit course" : "Add a course"} triggerProps={{ variant: course ? "secondary" : "primary", size: course ? "sm" : "md" }}>
      {(close) => (
        <ActionForm action={action} onSuccess={close}>
          <div className="grid grid-cols-[1fr_120px] gap-3">
            <Field label="Course name" htmlFor="c-name">
              <Input id="c-name" name="name" required defaultValue={course?.name} placeholder="Introduction to Psychology" />
            </Field>
            <Field label="Code" htmlFor="c-code">
              <Input id="c-code" name="code" defaultValue={course?.code ?? ""} placeholder="PSY 101" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Instructor" htmlFor="c-ins">
              <Input id="c-ins" name="instructorName" defaultValue={course?.instructorName ?? ""} />
            </Field>
            <Field label="Instructor email" htmlFor="c-em">
              <Input id="c-em" name="instructorEmail" type="email" defaultValue={course?.instructorEmail ?? ""} />
            </Field>
            <Field label="Meets" htmlFor="c-meet" hint="e.g. Mon/Wed 10:00–11:15">
              <Input id="c-meet" name="meetingInfo" defaultValue={course?.meetingInfo ?? ""} />
            </Field>
            <Field label="Location" htmlFor="c-loc">
              <Input id="c-loc" name="location" defaultValue={course?.location ?? ""} />
            </Field>
            <Field label="Term" htmlFor="c-term">
              <Input id="c-term" name="term" defaultValue={course?.term ?? ""} placeholder="Fall 2026" />
            </Field>
            <Field label="Course website" htmlFor="c-url">
              <Input id="c-url" name="url" type="url" defaultValue={course?.url ?? ""} placeholder="https://" />
            </Field>
          </div>
          <SubmitButton className="self-end">{course ? "Save" : "Add course"}</SubmitButton>
        </ActionForm>
      )}
    </Dialog>
  );
}

export function AssignmentDialog({ action, courses, defaultCourseId }: { action: Action; courses: Course[]; defaultCourseId?: string }) {
  return (
    <Dialog trigger="Add assignment" title="Add an assignment" description="Or paste details into Jarvis to add many at once." triggerProps={{ variant: "secondary" }}>
      {(close) => (
        <ActionForm action={action} onSuccess={close}>
          <Field label="Course" htmlFor="a-course">
            <Select id="a-course" name="courseId" required defaultValue={defaultCourseId}>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code ? `${c.code} — ${c.name}` : c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Title" htmlFor="a-title">
            <Input id="a-title" name="title" required />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Type" htmlFor="a-kind">
              <Select id="a-kind" name="kind" defaultValue="assignment">
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k[0].toUpperCase() + k.slice(1)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Due date" htmlFor="a-date">
              <Input id="a-date" name="dueDate" type="date" />
            </Field>
            <Field label="Time" htmlFor="a-time" hint="Blank = end of day">
              <Input id="a-time" name="dueTime" type="time" />
            </Field>
          </div>
          <Field label="Link" htmlFor="a-url">
            <Input id="a-url" name="url" type="url" placeholder="https://" />
          </Field>
          <Field label="Details" htmlFor="a-desc">
            <Textarea id="a-desc" name="description" rows={3} />
          </Field>
          <SubmitButton className="self-end">Add assignment</SubmitButton>
        </ActionForm>
      )}
    </Dialog>
  );
}
