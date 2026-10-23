# OmniFlow QA brand and compatibility identifiers

The product, publisher, installer, reports, exports, documentation, and visible UI
are branded **OmniFlow QA**, developed and maintained by **Infinity Lines of Code
Pvt Ltd**.

Some internal identifiers still contain the former `chromation` token. They are
not product branding: they are compatibility contracts for existing recordings,
preferences, plugins, custom elements, environment variables, fixture package
IDs, IPC markers, and report URLs. Renaming them without a versioned migration
would break existing user data and integrations. New customer-facing APIs and
artifacts must use OmniFlow naming; compatibility aliases will be removed only
through an explicit migration with backward reads.
