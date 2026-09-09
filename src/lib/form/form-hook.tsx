import { createFormHook, createFormHookContexts } from '@tanstack/react-form'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

/**
 * The app's form primitives, bound once.
 *
 * A field component cannot be written as an ordinary React component that takes
 * `form` as a prop: TanStack Form's form type carries a dozen validator
 * generics, so the prop type is unwriteable without `any` (which then loses
 * field-name checking entirely). `createFormHook` exists for exactly this --
 * field components read the field through context and stay fully typed.
 *
 * Phase 3's LineItemEditor is the real payoff: an array field of money inputs
 * that must not re-render the whole quote on every keystroke.
 */
export const { fieldContext, formContext, useFieldContext, useFormContext } =
  createFormHookContexts()

/** Shared label + control + error layout, so every form aligns identically. */
function FieldShell({
  label,
  hint,
  htmlFor,
  errors,
  children,
}: {
  label: string
  hint?: string
  htmlFor: string
  errors: Array<{ message?: string } | undefined>
  children: React.ReactNode
}) {
  const message = errors[0]?.message
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>
        {label}
        {hint ? (
          <span className="text-muted-foreground font-normal"> — {hint}</span>
        ) : null}
      </Label>
      {children}
      {message ? (
        // role=alert so a screen reader hears the failure without hunting for
        // it after a rejected submit.
        <p className="text-destructive text-xs" role="alert">
          {message}
        </p>
      ) : null}
    </div>
  )
}

export interface TextFieldProps {
  label: string
  hint?: string
  placeholder?: string
  type?: 'text' | 'email' | 'tel' | 'date'
  className?: string
}

function TextField({
  label,
  hint,
  placeholder,
  type = 'text',
  className,
}: TextFieldProps) {
  const field = useFieldContext<string>()
  return (
    <FieldShell
      label={label}
      hint={hint}
      htmlFor={field.name}
      errors={field.state.meta.errors}
    >
      <Input
        id={field.name}
        name={field.name}
        type={type}
        value={field.state.value}
        placeholder={placeholder}
        onBlur={field.handleBlur}
        onChange={(event) => field.handleChange(event.target.value)}
        aria-invalid={field.state.meta.errors.length > 0 || undefined}
        className={cn(className)}
      />
    </FieldShell>
  )
}

function TextAreaField({
  label,
  hint,
  placeholder,
  rows = 3,
}: {
  label: string
  hint?: string
  placeholder?: string
  rows?: number
}) {
  const field = useFieldContext<string>()
  return (
    <FieldShell
      label={label}
      hint={hint}
      htmlFor={field.name}
      errors={field.state.meta.errors}
    >
      <Textarea
        id={field.name}
        name={field.name}
        rows={rows}
        value={field.state.value}
        placeholder={placeholder}
        onBlur={field.handleBlur}
        onChange={(event) => field.handleChange(event.target.value)}
        aria-invalid={field.state.meta.errors.length > 0 || undefined}
      />
    </FieldShell>
  )
}

/**
 * `withForm` is exported alongside `useAppForm` because a large form has to be
 * split into components, and a child cannot take `form` as an ordinary prop --
 * the form type carries a dozen validator generics, so the annotation is
 * unwriteable without `any`, which then loses field-name checking entirely.
 * `withForm` binds the parent's exact type for the child.
 */
export const { useAppForm, withForm } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: { TextField, TextAreaField },
  formComponents: {},
})
