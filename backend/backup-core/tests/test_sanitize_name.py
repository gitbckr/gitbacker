from services.backup_service import _sanitize_name


def test_simple_name():
    assert _sanitize_name("myrepo") == "myrepo"


def test_path_traversal():
    assert _sanitize_name("../../etc/passwd") == "passwd"


def test_special_chars():
    assert _sanitize_name("my repo@v2!") == "my_repo_v2_"


def test_empty_string():
    assert _sanitize_name("") == "repo"
