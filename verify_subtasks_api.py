import requests
import datetime

BASE_URL = 'http://127.0.0.1:5001/api'
DATE_STR = datetime.date.today().isoformat()

def test_api():
    print(f"Testing API on {BASE_URL}")

    # 1. Create Routine
    r = requests.post(f"{BASE_URL}/routines", json={'title': 'API Test Routine', 'target_days': '0,1,2,3,4,5,6'})
    assert r.status_code == 201
    routine_id = r.json()['id']
    print(f"Created routine: {routine_id}")

    # 2. Add Subtask
    r = requests.post(f"{BASE_URL}/routines/{routine_id}/subtasks", json={'title': 'Sub 1'})
    assert r.status_code == 201
    sub1_id = r.json()['id']
    print(f"Created subtask 1: {sub1_id}")

    r = requests.post(f"{BASE_URL}/routines/{routine_id}/subtasks", json={'title': 'Sub 2'})
    assert r.status_code == 201
    sub2_id = r.json()['id']
    print(f"Created subtask 2: {sub2_id}")

    # 3. Verify initial state (Incomplete)
    # Check routine log via history or list
    r = requests.get(f"{BASE_URL}/routines")
    routines = r.json()['routines']
    my_routine = next(r for r in routines if r['id'] == routine_id)
    # Check today's log in week_logs
    today_log = next(l for l in my_routine['week_logs'] if l['date'] == DATE_STR)
    assert today_log['completed'] == False
    print("Initial state: Incomplete (Correct)")

    # 4. Toggle Sub 1 -> Complete
    r = requests.post(f"{BASE_URL}/subtasks/{sub1_id}/toggle", json={'date': DATE_STR})
    assert r.status_code == 200
    assert r.json()['completed'] == True
    assert r.json()['parent_routine_completed'] == False
    print("Toggled Sub 1: Complete. Parent: Incomplete (Correct)")

    # 5. Toggle Sub 2 -> Complete
    r = requests.post(f"{BASE_URL}/subtasks/{sub2_id}/toggle", json={'date': DATE_STR})
    assert r.status_code == 200
    assert r.json()['completed'] == True
    assert r.json()['parent_routine_completed'] == True
    print("Toggled Sub 2: Complete. Parent: Complete (Correct)")

    # 6. Verify Parent Routine Log is True
    r = requests.get(f"{BASE_URL}/routines")
    routines = r.json()['routines']
    my_routine = next(r for r in routines if r['id'] == routine_id)
    today_log = next(l for l in my_routine['week_logs'] if l['date'] == DATE_STR)
    assert today_log['completed'] == True
    print("Parent Routine Log Verification: Complete (Correct)")

    # 7. Toggle Sub 1 -> Incomplete
    r = requests.post(f"{BASE_URL}/subtasks/{sub1_id}/toggle", json={'date': DATE_STR})
    assert r.status_code == 200
    assert r.json()['completed'] == False
    assert r.json()['parent_routine_completed'] == False
    print("Toggled Sub 1: Incomplete. Parent: Incomplete (Correct)")

    # 8. Delete Routine (Cleanup)
    r = requests.delete(f"{BASE_URL}/routines/{routine_id}")
    assert r.status_code == 200
    print("Deleted routine")

    print("\nALL API TESTS PASSED!")

if __name__ == '__main__':
    try:
        test_api()
    except Exception as e:
        print(f"\nTEST FAILED: {e}")
        exit(1)
