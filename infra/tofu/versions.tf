terraform {
  required_version = ">= 1.6"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 8.0"
    }
    # Firebase Hosting custom domains exist only in the beta provider.
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 8.0"
    }
  }

  # State is LOCAL by default and gitignored. That is deliberate for a
  # one-person setup: the alternative is standing up a state backend, which is
  # more infrastructure than the handful of resources it would be protecting.
  #
  # Switch to GCS when CI needs to run `tofu apply`:
  #
  #   backend "gcs" {
  #     bucket = "riglink-508420-tofu-state"
  #     prefix = "hosting"
  #   }
  #
  # Until then: the state file contains resource ids, not secrets, but it is
  # gitignored regardless because state is not a source artifact.
}

# Both read Application Default Credentials: `gcloud auth application-default
# login` locally. No key file, ever -- see README.md.
provider "google" {
  project = var.project_id
}

provider "google-beta" {
  project = var.project_id
}
