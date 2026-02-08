export default function FormField({ label, error, type = 'text', className = '', children, ...inputProps }) {
  const inputClasses = `input ${error ? 'border-red-500' : ''} ${className}`
  const inputId = inputProps.id || inputProps.name

  return (
    <div className="mb-4">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-gray-700 mb-1">
          {label}
        </label>
      )}

      {children ? (
        <select id={inputId} className={inputClasses} {...inputProps}>
          {children}
        </select>
      ) : (
        <input
          id={inputId}
          type={type}
          className={inputClasses}
          {...inputProps}
        />
      )}

      {error && (
        <p className="mt-1 text-sm text-red-500">{error}</p>
      )}
    </div>
  )
}
