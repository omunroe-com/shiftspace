from datetime import datetime
from couchdb.schema import *
from couchdb.schema import View

from server.utils.decorators import *
import server.utils.utils as utils
import schema
import core

from server.models.ssdocschema import *
from server.models.ssuserschema import *
from server.models.permschema import *

# ==============================================================================
# Errors
# =============================================================================

class ShiftError(Exception): pass
class NoAuthorError(ShiftError): pass
class NoSpaceError(ShiftError): pass
class NoHrefError(ShiftError): pass
class NoContentError(ShiftError): pass

# ==============================================================================
# Utilities
# ==============================================================================

def toDict(kvs):
    result = {}
    for kv in kvs:
        result[kv['key']] = kv['value']
    return result


@simple_decorator
def joindecorator(func):
    def afn(*args, **kwargs):
        return Shift.joinData(func(*args, **kwargs), userId=kwargs.get("userId"))
    return afn

# ==============================================================================
# Shift Model
# ==============================================================================

class Shift(SSDocument):

    # ========================================
    # Fields
    # ========================================

    type = TextField(default="shift")
    userName = TextField()
    href = TextField()
    domain = TextField()
    space = DictField(Schema.build(
            name = TextField(),
            version = TextField()
            ))
    summary = TextField()
    broken = BooleanField(default=False)
    commentStream = TextField()
    publishData = DictField(Schema.build(
            draft = BooleanField(default=True),
            private = BooleanField(default=True),
            publishTime = DateTimeField(),
            dbs = ListField(TextField())
            ))
    content = DictField()    
            
    # ========================================
    # CouchDB Views
    # ========================================

    all = View(
        "shifts",
        "function (doc) {            \
           if(doc.type == 'shift') { \
             emit(doc._id, doc);     \
           }                         \
         }")

    by_created = View(
        "shifts",
        "function (doc) {                        \
           if(doc.type == 'shift') {             \
             emit(doc.created, doc);             \
           }                                     \
         }")

    by_domain_and_created = View(
        "shifts",
        "function (doc) {                          \
           if(doc.type == 'shift') {               \
             emit([doc.domain, doc.created], doc); \
           }                                       \
         }")

    by_href_and_created = View(
        "shifts",
        "function(doc) {                         \
           if(doc.type == 'shift') {             \
             emit([doc.href, doc.created], doc); \
           }                                     \
         }")

    by_user_and_created = View(
        "shifts",
        "function(doc) {                             \
           if(doc.type == 'shift') {                 \
             emit([doc.createdBy, doc.created], doc); \
           }                                         \
         }")

    by_group_and_created = View(
        "shifts",
        "function(doc) {                                      \
           if(doc.type == 'shift') {                          \
             var dbs = doc.publishData.dbs;                   \
             for(var i = 0, len = dbs.length; i < len; i++) { \
                var db = dbs[i], typeAndId = db.split('_');   \
                if(typeAndId[0] == 'group') {                 \
                  emit([doc.created, db], doc);               \
                }                                             \
             }                                                \
           }                                                  \
         }")

    by_follow_and_created = View(
        "shifts",
        "function(doc) {                                      \
           if(doc.type == 'shift') {                          \
             var dbs = doc.publishData.dbs;                   \
             for(var i = 0, len = dbs.length; i < len; i++) { \
                var db = dbs[i], typeAndId = db.split('_');   \
                if(typeAndId[0] == 'user') {                  \
                  emit([doc.created, db], doc);               \
                }                                             \
             }                                                \
           }                                                  \
         }")

    by_user = View(
        "shifts",
        "function(doc) {               \
           if(doc.type == 'shift') {   \
             emit(doc.createdBy, doc); \
           }                           \
        }")

    count_by_domain = View(
        "shifts",
        "function(doc) {             \
           if(doc.type == 'shift') { \
             emit(doc.domain, 1);    \
           }                         \
         }",
        "function(keys, values, rereduce) { \
           return sum(values);              \
         }")

    # ========================================
    # Class Methods
    # ========================================

    @classmethod
    def joinData(cls, shifts, userId=None):
        from server.models.favschema import Favorite

        single = False
        if type(shifts) != list:
            single = True
            shifts = [shifts]
        ids = [shift['_id'] for shift in shifts]
        favIds = [Favorite.makeId(userId, shiftId) for shiftId in ids]

        isFavorited = [(favorite and True) for favorite in core.fetch(keys=favIds)]

        favd = toDict(core.fetch(view=schema.favoritesByShift, keys=ids, reduce=True))
        favCounts = [(favd.get(aid) or 0) for aid in ids]

        ccd = toDict(core.fetch(view=schema.countByShift, keys=ids, reduce=True))
        commentCounts = [(ccd.get(aid) or 0) for aid in ids]

        userIds = [shift['createdBy'] for shift in shifts]
        gravatars = [((user and user.get("gravatar")) or "images/default_user.png")
                     for user in core.fetch(keys=userIds)]

        for i in range(len(shifts)):
            shifts[i]["favorite"] = isFavorited[i]
            shifts[i]["favoriteCount"] = favCounts[i]
            shifts[i]["commentCount"] = commentCounts[i]
            shifts[i]["gravatar"] = gravatars[i]

        if single:
            return shifts[0]
        else:
            return shifts

    @classmethod
    def create(cls, shiftJson):
        newShift = Shift(**shiftJson)
        createdBy = newShift.createdBy
        db = core.connect(SSUser.privateDb(createdBy))
        newShift.domain = utils.domain(newShift.href)
        newShift.store(db)
        core.replicate(SSUser.privateDb(createdBy), SSUser.feedDb(createdBy))
        return Shift.joinData(newShift, newShift.createdBy)

    @classmethod
    def read(cls, id, userId):
        db = core.connect(SSUser.publicDb(userId))
        theShift = Shift.load(db, id)
        if not theShift and userId:
            db = core.connect(SSUser.privateDb(userId))
            theShift = Shift.load(db, id)
        if not theShift:
            return
        return Shift.joinData(theShift, theShift.createdBy)

    # ========================================
    # Instance methods
    # ========================================

    def update(self, fields):
        if fields.get("content"):
            self.content = fields.get("content")
        if fields.get("summary"):
            self.summary = self.content["summary"] = fields.get("summary")
        if fields.get("broken"):
            self.broken = fields.get("broken")
        self.modified = datetime.now()

        if self.publishData.private:
            db = core.connect(SSUser.privateDb(self.createdBy))
        else:
            db = core.connect(SSUser.publicDb(self.createdBy))
        self.store(db)

        if self.publishData.private:
            core.replicate(SSUser.privateDb(self.createdBy), SSUser.feedDb(self.createdBy))
        else:
            core.replicate(SSUser.publicDb(self.createdBy), SSUser.feedDb(self.createdBy))

        for db in self.publishData.dbs:
            dbtype, dbid = db.split("/")
            if dbtype == "user":
                inbox = core.connect(SSUser.inboxDb(dbid))
                self.store(inbox)
            elif dbtype == "group":
                from server.models.groupschema import Group
                Group.read(dbid).updateShift(self)

        return Shift.joinData(self, self.createdBy)


    def delete(self):
        db = core.connect(SSUser.privateDb(self.createdBy))
        if db.get(self.id):
            del db[self.id]
        else:
            db = core.connect(SSUser.publicDb(self.createdBy))
            if db.get(self.id):
                del db[self.id]


    def publishIds(self):
        return [db.split("/")[1].split("/")[0] for db in self.publishData.dbs]

    # ========================================
    # Validation
    # ========================================
    
    def isPublic(self):
        return not self.publishData.private


    def isPrivate(self):
        return self.publishData.private

    # ========================================
    # Publishing
    # ========================================

    def publish(self, publishData=None, server="http://www.shiftspace.org/api/"):
        db = core.connect(SSUser.privateDb(self.createdBy))
        author = SSUser.read(self.createdBy)
        oldPublishData = dict(self.items())["publishData"]
        allowed = []

        # get the private status
        isPrivate = True
        if publishData and publishData.get("private") != None:
            isPrivate = publishData.get("private")
        else:
            isPrivate = self.isPrivate()

        # get the dbs being published to
        publishDbs = (publishData and publishData.get("dbs")) or []

        # get the list of dbs the user is actually allowed to publish to
        allowed = []
        if (publishData and isPrivate and len(publishDbs) > 0):
            from server.models.groupschema import Group
            allowedGroups = author.writeable()
            allowed = list(set(allowedGroups).intersection(set(publishDbs)))

        # upate the private setting, the shift is no longer draft
        self.publishData.private = isPrivate
        self.publishData.draft = False
        
        # publish or update a copy of the shift to all user-x/private, user-y/private ...
        newUserDbs = [s for s in publishDbs if s.split("/")[0] == "user"]
        oldUserDbs = [s for s in oldPublishData.get("dbs") if s.split("/")[0] == "user"]
        newUserDbs = list(set(newUserDbs).difference(set(oldUserDbs)))

        # update target user inboxes
        [self.udpateIn(db) for db in oldUserDbs]
        [self.copyTo(db) for db in newUserDbs]

        # publish or update a copy to group/x, group/y, ...
        newGroupDbs = [s for s in allowed if s.split("/")[0] == "group"]
        oldGroupDbs = [s for s in oldPublishData.get("dbs") if s.split("/")[0] == "group"]
        newGroupDbs = list(set(newGroupDbs).difference(set(oldGroupDbs)))
        
        # update/add to group dbs
        self.updateInGroups(oldGroupDbs)
        self.addToGroups(newGroupDbs)

        # create in user/public, delete from user/private
        # replicate to user/feed and to shiftspace/public
        # replicate shiftspace/public to shiftspace/shared
        if not isPrivate:
            publicdb = SSUser.publicDb(self.createdBy)
            if Shift.load(core.connect(publicdb), self.id):
                self.updateIn(publicdb)
            else:
                self.copyTo(publicdb)
                privatedb = core.connect(SSUser.privateDb(self.createdBy))
                del privatedb[self.id]
            core.replicate(SSUser.publicDb(self.createdBy), SSUser.feedDb(self.createdBy))
            core.replicate(SSUser.publicDb(self.createdBy), "shiftspace/public")

        # TODO: don't replicate to follower user_x/feeds that are not peers - David
        followers = author.followers()
        [core.replicate(SSUser.publicDb(self.createdBy), SSUser.feedDb(follower)) for follower in followers]
        
        # copy to shiftspace/shared, we need it there
        # for general queries about what's available on pages - David
        self.copyOrUpdateTo("shiftspace/shared")
        return Shift.joinData(self, self.createdBy)
        
    def unpublish(self):
        # TODO: need to figure out if we want to support this - David 11/18/09
        pass

    def copyOrUpdateTo(self, dbname):
        db = core.connect(dbname)
        if not db.get(self.id):
            self.copyTo(dbname)
        else:
            self.updateIn(dbname)


    def addToGroups(self, groupDbs):
        from server.models.groupschema import Group
        # NOTE - do we need to delete from user/private? - David 11/12/09
        for db in groupDbs:
            dbtype, dbid = db.split("/")
            theGroup = Group.read(dbid)
            theGroup.addShift(self)

    
    def updateInGroups(self, groupDbs):
        from server.models.groupschema import Group
        for db in groupDbs:
            dbtype, dbid = db.split("/")
            theGroup = Group.read(dbid)
            theGroup.updateShift(self)

    # ========================================
    # Comments
    # ========================================

    def commentCount(self):
        from server.models.commentschema import Comment
        db = core.connect()
        return core.value(Comment.count_by_shift(db, key=self.id))


    def comments(self, start=None, end=None, limit=25):
        from server.models.commentschema import Comment
        db = core.connect(Comment.db(self.id))
        return core.objects(Comment.by_created(db, limit=limit))


    def hasThread(self):
        from server.models.commentschema import Comment
        try:
            server = core.server()
            thread = server[Comment.db(self.id)]
            return thread != None
        except Exception:
            return False


    def deleteThread(self):
        from server.models.commentschema import Comment
        server = core.server()
        # TODO - use bulk API to delete all comment stubs - David
        del server[Comment.db(self.id)]


    def subscribers(self):
        from server.models.commentschema import Comment
        db = core.connect(Comment.db(self.id))
        return core.values(Comment.all_subscribed(db))


    def favoriteCount(self):
        from server.models.favschema import Favorite
        db = core.connect("shiftspace/shared")
        return core.value(Favorite.count_by_shift(db, key=self.id)) or 0
    
    # ========================================
    # List & Filtering Support
    # ========================================

    #@joindecorator
    @classmethod
    def shifts(cls, byHref, userId=None, byFollowing=False, byGroups=False, start=0, limit=25):
        db = core.connect()
        # NOTE: to prevent errors on a newly created DB - David 9/11/09
        """
        if core.single(Stats.count, "shift") == None:
            return []
        """
        print "Connect to lucene"
        lucene = core.lucene()
        # TODO: validate byHref - David
        queryString = "href:\"%s\" AND ((draft:false AND private:false)" % byHref
        if userId:
            queryString = queryString + " OR createdBy:%s" % userId
            streams = ""
            #Need to fix this, a lot has changed
            """
            if byFollowing:
                following = User.followStreams(userId)
                streams = streams + " ".join(following)
            if byGroups:
                groups = User.groupStrems(userId)
                streams = streams + " ".join(groups)
            """
            # TODO: make sure streams cannot be manipulated from client - David
            queryString = queryString + ((" OR (draft:false%s)" % ((len(streams) > 0 and (" AND streams:%s" % streams)) or "")))
        queryString = queryString + ")"
        rows = lucene.search("shifts", q=queryString, sort="\modified", skip=start, limit=limit)
        print "WTF!"
        # super slow, multidoc fetch instead
        shifts = [db[row["id"]] for row in rows]
        return shifts