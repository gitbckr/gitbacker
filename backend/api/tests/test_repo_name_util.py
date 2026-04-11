from app.services.repository_service import _repo_name_from_url


def test_github_https():
    assert _repo_name_from_url("https://github.com/user/repo.git") == "repo"


def test_no_dot_git():
    assert _repo_name_from_url("https://github.com/user/repo") == "repo"


def test_trailing_slash():
    assert _repo_name_from_url("https://github.com/user/repo/") == "repo"


def test_ssh_url():
    assert _repo_name_from_url("ssh://git@host/user/repo.git") == "repo"
