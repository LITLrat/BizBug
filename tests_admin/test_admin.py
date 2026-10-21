import os
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
path=Path('/tmp/bizbug_admin_test_20261021.sqlite3')
path.unlink(missing_ok=True)
os.environ['BIZBUG_DEV_MODE']='true'
os.environ['BIZBUG_ADMIN_SQLITE']=str(path)
os.environ['BIZBUG_BOOTSTRAP_EMAIL']='admin@bizbug.test'
os.environ['BIZBUG_BOOTSTRAP_PASSWORD']='a-dedicated-long-test-password'

from admin_portal.main import app


def login(client,email,password):
    r=client.post('/api/auth/login',json={'email':email,'password':password})
    assert r.status_code==200,r.text
    return r.json()['csrf']

def post(client,url,payload,csrf):
    return client.post(url,json=payload,headers={'X-BizBug-CSRF':csrf})

def patch(client,url,payload,csrf):
    return client.patch(url,json=payload,headers={'X-BizBug-CSRF':csrf})


def test_health_login_and_missing_csrf():
    with TestClient(app) as c:
        assert c.get('/health').json()['application']=='bizbug-admin'
        assert c.get('/api/admin/overview').status_code==401
        assert c.post('/api/auth/login',json={'email':'admin@bizbug.test','password':'nope'}).status_code==401
        csrf=login(c,'admin@bizbug.test','a-dedicated-long-test-password')
        assert c.get('/api/admin/overview').status_code==200
        assert c.post('/api/admin/businesses',json={'name':'Bad Write'}).status_code==403
        assert post(c,'/api/admin/businesses',{'name':'First Business','industry':'Home Services'},csrf).status_code==201
        assert c.post('/api/auth/logout',headers={'X-BizBug-CSRF':csrf}).status_code==200
        assert c.get('/api/admin/overview').status_code==401


def test_owner_can_only_see_own_business_and_cannot_manage_agency():
    with TestClient(app) as admin:
        token=login(admin,'admin@bizbug.test','a-dedicated-long-test-password')
        a=post(admin,'/api/admin/businesses',{'name':'Salon Blue'},token).json()['id']
        b=post(admin,'/api/admin/businesses',{'name':'Salon Red'},token).json()['id']
        owner=post(admin,f'/api/admin/businesses/{a}/owners',{'email':'owner@bizbug.test','name':'Salon Manager'},token)
        assert owner.status_code==201,owner.text
        temp=owner.json()['temporary_password']
        assert len(temp)>20
        with TestClient(app) as user:
            owner_csrf=login(user,'owner@bizbug.test',temp)
            assert user.get('/api/portal/businesses').status_code==403
            assert user.get(f'/api/portal/businesses/{a}/summary').status_code==403
            assert post(user,f'/api/portal/businesses/{a}/leads',{'name':'Test Guest','phone':'8435550101'},owner_csrf).status_code==403
            changed=post(user,'/api/auth/change-password',{'old_password':temp,'new_password':'new-personal-password-is-long'},owner_csrf)
            assert changed.status_code==200,changed.text
            assert user.get('/api/admin/overview').status_code==403
            listings=user.get('/api/portal/businesses').json()
            assert len(listings)==1 and listings[0]['id']==a
            assert user.get(f'/api/portal/businesses/{a}/summary').status_code==200
            assert user.get(f'/api/portal/businesses/{b}/summary').status_code==404
            assert user.get(f'/api/portal/businesses/{b}/leads').status_code==404
            assert user.get(f'/api/portal/businesses/{b}/appointments').status_code==404
            assert post(user,f'/api/admin/businesses',{'name':'Unauthorized'},owner_csrf).status_code==403
            assert patch(user,f'/api/admin/businesses/{a}',{'name':'Unauthorized'},owner_csrf).status_code==403
            assert post(user,f'/api/portal/businesses/{b}/leads',{'name':'Spy Contact','phone':'8435550202'},owner_csrf).status_code==404
            assert post(user,f'/api/portal/businesses/{b}/appointments',{'customer':'Spy','service':'Inspection'},owner_csrf).status_code==404
            lead=post(user,f'/api/portal/businesses/{a}/leads',{'name':'Real Customer','phone':'8435550303','summary':'I need a haircut'},owner_csrf)
            assert lead.status_code==201,lead.text
            app_req=post(user,f'/api/portal/businesses/{a}/appointments',{'customer':'Real Customer','service':'Haircut','requested_for':'Tomorrow'},owner_csrf)
            assert app_req.status_code==201 and app_req.json()['confirmed'] is False
            assert patch(user,f'/api/portal/businesses/{b}/leads/{lead.json()["id"]}',{'status':'closed'},owner_csrf).status_code==404
            assert patch(user,f'/api/portal/businesses/{a}/leads/{lead.json()["id"]}',{'status':'qualified'},owner_csrf).status_code==200
            assert patch(user,f'/api/portal/businesses/{a}/appointments/{app_req.json()["id"]}',{'status':'confirmed'},owner_csrf).status_code==422
            assert len(user.get(f'/api/portal/businesses/{a}/leads').json())==1
            assert len(user.get(f'/api/portal/businesses/{a}/appointments').json())==1


def test_admin_activity_and_separate_demo():
    with TestClient(app) as c:
        csrf=login(c,'admin@bizbug.test','a-dedicated-long-test-password')
        overview=c.get('/api/admin/overview').json()
        assert overview['counts']['businesses']>=3
        assert overview['counts']['leads']>=1
        assert any(row['action']=='lead.created' for row in c.get('/api/admin/audit').json())
        assert c.get('/static/app.js').status_code==404
        assert c.get('/assets/app.js').status_code==200
        assert c.get('/').status_code==200
        assert c.get('/api/auth/me').json()['csrf']
        assert post(c,'/api/admin/businesses',{'name':'With Stale CSRF'},csrf).status_code==403


def test_reject_cross_origin_login_and_private_internal_notes():
    with TestClient(app) as c:
        r=c.post('/api/auth/login',json={'email':'admin@bizbug.test','password':'a-dedicated-long-test-password'},headers={'Origin':'https://evil.example'})
        assert r.status_code==403
        csrf=login(c,'admin@bizbug.test','a-dedicated-long-test-password')
        business=post(c,'/api/admin/businesses',{'name':'Secret Notes Shop','notes':'Agency confidential fee details'},csrf).json()['id']
        resp=post(c,f'/api/admin/businesses/{business}/owners',{'email':'owner2@bizbug.test','name':'Owner Two'},csrf).json()
        with TestClient(app) as owner:
            x=login(owner,'owner2@bizbug.test',resp['temporary_password'])
            post(owner,'/api/auth/change-password',{'old_password':resp['temporary_password'],'new_password':'new-and-private-password-very-long'},x)
            available=owner.get('/api/portal/businesses').json()
            assert len(available)==1 and 'notes' not in available[0]
            info=owner.get(f'/api/portal/businesses/{business}/summary').json()
            assert 'notes' not in info['business']
