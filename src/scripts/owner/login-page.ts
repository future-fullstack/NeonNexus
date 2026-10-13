import {setupOwnerLogin} from './login';
import {withBase} from '../../lib/paths';
setupOwnerLogin(()=>{location.assign(withBase('/admin/'));});
