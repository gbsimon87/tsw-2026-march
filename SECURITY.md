# Security Policy

## Supported Versions

This repository is a starter template. Security fixes should be applied on the default template branch and then propagated to projects cloned from it.

## Reporting a Vulnerability

Do not open public issues for sensitive vulnerabilities.

Report privately to your project maintainer/security contact with:

- affected component and endpoint
- reproduction steps
- impact assessment
- suggested remediation (if known)

Acknowledge receipt within 3 business days and provide remediation status updates until resolved.

## Secret Management

- Never commit `.env` files or production secrets.
- Use separate credentials for prod (`main`) and dev (`dev`) environments.
- Rotate JWT, OAuth, SMTP, and database credentials after exposure or team-member offboarding.
