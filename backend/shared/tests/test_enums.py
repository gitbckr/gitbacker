from shared.enums import JobStatus, RepoPermission, RepoStatus


def test_repo_permission_ordering():
    assert RepoPermission.VIEW < RepoPermission.MANAGE
    assert RepoPermission.VIEW == 1
    assert RepoPermission.MANAGE == 2


def test_repo_status_values():
    expected = {
        "verifying", "scheduled", "running", "backed_up",
        "failed", "access_error", "unreachable",
    }
    actual = {s.value for s in RepoStatus}
    assert actual == expected


def test_job_status_values():
    expected = {"pending", "running", "succeeded", "failed"}
    actual = {s.value for s in JobStatus}
    assert actual == expected
