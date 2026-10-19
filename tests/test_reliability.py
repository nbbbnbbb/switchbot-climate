import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from datetime import datetime, timezone


def module(name):
    spec=importlib.util.spec_from_file_location(name,Path(__file__).resolve().parents[1]/'scripts'/f'{name}.py')
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m


continuous=module('continuous_collect')
watchdog=module('watchdog')


class ReliabilityTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup);self.data=Path(self.temp.name)/'data'
        self.data.mkdir();(self.data/'history').mkdir()

    def write(self,path,value):
        p=self.data/path;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(value))

    def test_conflict_replay_keeps_remote_pruning_and_other_new_records(self):
        # A fresh main has already removed earlier history. Replay only new samples.
        old={'at':'2026-10-19T07:01:00Z','values':{'a':{'temperature':20,'humidity':50}}}
        remote={'at':'2026-10-19T08:01:00Z','values':{'a':{'temperature':21,'humidity':51}}}
        sample={'at':'2026-10-19T08:02:00Z','values':{'a':{'temperature':22,'humidity':52}}}
        self.write('history/2026-10.json',[old,remote])
        self.write('latest.json',{'sensors':[{'id':'a','collectedAt':'2026-10-19T08:03:00Z','temperature':23}],'plugs':[]})
        self.write('status.json',{'attemptedAt':'2026-10-19T08:03:00Z','state':'ok'})
        pending={'row':sample,'latest':{'sensors':[{'id':'a','collectedAt':sample['at'],'temperature':22}],'plugs':[]},'status':{'attemptedAt':sample['at'],'state':'ok'}}
        continuous.merge_samples([pending,pending],self.data)
        rows=json.loads((self.data/'history/2026-10.json').read_text())
        self.assertEqual([r['at'] for r in rows],[old['at'],remote['at'],sample['at']])
        self.assertEqual(json.loads((self.data/'latest.json').read_text())['sensors'][0]['temperature'],23)
        self.assertEqual(json.loads((self.data/'status.json').read_text())['attemptedAt'],'2026-10-19T08:03:00Z')

    def test_snapshot_is_actual_24_hour_history_and_timeout_keeps_old_measurement_time(self):
        self.write('history/2026-10.json',[{'at':'2026-10-17T08:00:00Z','values':{}},{'at':'2026-10-19T08:00:00Z','values':{'a':{'temperature':20,'humidity':50}}}])
        self.write('latest.json',{'sensors':[{'id':'a','collectedAt':'2026-10-19T08:00:00Z','temperature':20,'state':'ok'}],'plugs':[]})
        self.write('status.json',{'attemptedAt':'2026-10-19T08:00:00Z','state':'ok'})
        snapshot=continuous.make_live_snapshot(self.data,datetime(2026,10,19,9,tzinfo=timezone.utc))
        self.assertEqual(len(snapshot['rows']),1)
        continuous.mark_timeout(self.data)
        latest=json.loads((self.data/'latest.json').read_text())['sensors'][0]
        self.assertEqual(latest['collectedAt'],'2026-10-19T08:00:00Z');self.assertEqual(latest['temperature'],20);self.assertEqual(latest['state'],'error')
        self.assertEqual(len(json.loads((self.data/'history/2026-10.json').read_text())),2)

    def test_watchdog_distinguishes_platform_queue_from_running_hung_collector(self):
        self.assertEqual(watchdog.recovery_action(10,[],set()),('healthy',[]))
        self.assertEqual(watchdog.recovery_action(400,[],set()),('start',[]))
        self.assertEqual(watchdog.recovery_action(1800,[{'id':1,'status':'queued'}],set()),('waiting_for_runner',[]))
        self.assertEqual(watchdog.recovery_action(400,[{'id':1,'status':'in_progress'}],{1}),('collecting',[]))
        self.assertEqual(watchdog.recovery_action(700,[{'id':1,'status':'in_progress'}],{1}),('restart',[1]))
        self.assertEqual(watchdog.recovery_action(700,[{'id':1,'status':'in_progress','jobs_finished':True}],set()),('restart',[1]))
        self.assertEqual(watchdog.age_seconds({},datetime.now(timezone.utc)),float('inf'))
