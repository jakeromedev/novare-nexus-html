"""Run with python3 -m unittest test_dev (no extra dependencies)."""
from pathlib import Path
import tempfile
import unittest

from dev import BuildError, build, resolve


class BuilderTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)

    def write(self, name, text):
        (self.root / name).write_text(text, encoding='utf-8')

    def test_recursive_includes_preserve_wrappers(self):
        self.write('Index.html', "<?!= include('A'); ?><?!= include(\"A\") ?>")
        self.write('A.html', "<style>x{color:red}</style><?!= include('B'); ?>")
        self.write('B.html', '<script>window.example = true;</script>')
        result = resolve('Index.html', self.root)
        self.assertNotIn('<?', result)
        self.assertEqual(result.count('<style>'), 2)
        self.assertEqual(result.count('<script>'), 2)
        self.assertNotIn('<style><style>', result)

    def test_missing_include(self):
        self.write('Index.html', "<?!= include('Page_Test'); ?>")
        with self.assertRaisesRegex(BuildError, "Index.html references include.*Page_Test.html does not exist"):
            resolve('Index.html', self.root)

    def test_circular_include(self):
        self.write('A.html', "<?!= include('B'); ?>")
        self.write('B.html', "<?!= include('A'); ?>")
        with self.assertRaisesRegex(BuildError, 'A.html → B.html → A.html'):
            resolve('A.html', self.root)

    def test_unsupported_scriptlet(self):
        self.write('Index.html', '<?= user.name ?>')
        with self.assertRaisesRegex(BuildError, 'unsupported'):
            resolve('Index.html', self.root)

    def test_cannot_include_outside_project(self):
        with self.assertRaisesRegex(BuildError, 'inside the project'):
            resolve('../outside.html', self.root)

    def test_build_is_generated_only_and_injects_shim_first(self):
        source = '<html><head></head><body><?!= include("Scripts"); ?></body></html>'
        self.write('Index.html', source)
        self.write('Scripts.html', '<script>app();</script>')
        self.write('LocalDevShim.html', '<script>shim();</script>')
        build(self.root, self.root / '.local')
        result = (self.root / '.local/index.html').read_text()
        self.assertLess(result.index('shim();'), result.index('app();'))
        self.assertIn('name="viewport"', result)
        self.assertEqual((self.root / 'Index.html').read_text(), source)
        self.write('Scripts.html', '<script>updated();</script>')
        build(self.root, self.root / '.local')
        self.assertIn('updated();', (self.root / '.local/index.html').read_text())

    def test_failed_build_preserves_last_complete_artifact(self):
        self.write('Index.html', '<head></head>')
        self.write('LocalDevShim.html', '<script>shim();</script>')
        build(self.root, self.root / '.local')
        previous = (self.root / '.local/index.html').read_bytes()
        self.write('Index.html', '<head></head><?!= include("missing"); ?>')
        with self.assertRaises(BuildError):
            build(self.root, self.root / '.local')
        self.assertEqual((self.root / '.local/index.html').read_bytes(), previous)


if __name__ == '__main__':
    unittest.main()
