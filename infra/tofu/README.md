# Google Cloud infrastructure

OpenTofu owns the durable hosting resources in the `riglink-508420` project:
the `my.riglink.app` custom domain on Firebase Hosting, its records in the
existing Cloud DNS zone, and the Workload Identity Federation setup GitHub
Actions deploys through -- including the two repository variables the deploy
job reads. It deliberately does **not** own the site content
-- see the header comment in `main.tf` for why.

    firebase          deploys the app on every commit  (build artifact)
    opentofu          points a hostname at it, once    (infrastructure)

## Credentials

None stored anywhere. The Google providers use Application Default
Credentials:

    gcloud auth application-default login

Your account needs to be able to manage DNS records, Firebase Hosting, IAM
service accounts and workload identity pools in the project -- Owner covers
it.

The GitHub provider reads `GITHUB_TOKEN`. Create a **fine-grained** token at
<https://github.com/settings/personal-access-tokens/new>:

| Setting           | Value                                       |
| ----------------- | ------------------------------------------- |
| Repository access | Only select repositories: `riglink`         |
| Permissions       | Repository -> **Variables**: Read and write |
| Expiration        | Short -- it is only needed for `tofu apply` |

Nothing else. Pass it for the one command rather than exporting it into
your shell, so it does not end up in history or linger:

    read -rs GITHUB_TOKEN && export GITHUB_TOKEN && tofu apply; unset GITHUB_TOKEN

CI never runs `tofu`; it only deploys, through the service account this
creates.

## First run

    cp terraform.tfvars.example terraform.tfvars   # then fill it in
    tofu init
    tofu plan
    tofu apply

`terraform.tfvars` is gitignored: it names your project and repository, which
is not secret but is not this repository's business either.

Then wait for `tofu refresh && tofu output cert_state` to say `CERT_ACTIVE`
(minutes to a day), and follow `tofu output next_steps` for the Supabase
`site_url` change.

## The DNS check

`main.tf` uses the records Firebase documents for a subdomain: an A record to
`199.36.158.100` and a `hosting-site=` TXT record. Firebase's API separately
lists a CNAME to `riglink-508420.web.app` as its "desired" record and keeps
reporting it as an ADD even once A + TXT are verified -- both setups work.

So the `check` block asks Firebase for its verdict instead -- `host_state`
and `ownership_state` must be active -- and `tofu plan` warns if Hosting
ever stops accepting the records. It is a warning, not an error: OpenTofu
checks never block an apply.

## State

Local, and gitignored. When CI needs to run `tofu apply`, switch to the GCS
backend sketched in `versions.tf`.
