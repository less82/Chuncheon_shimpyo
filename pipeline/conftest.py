"""pytest 부트스트랩: pipeline 디렉터리를 import 경로에 추가한다."""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
